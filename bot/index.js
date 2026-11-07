require('dotenv').config();
const crypto = require('crypto');
const { File } = require('node:buffer');
const { Telegraf, Markup } = require('telegraf');
const Groq = require('groq-sdk');
const { createClient } = require('@supabase/supabase-js');
const { claveSalon, rankearProductos, buscarProfesores } = require('./utils');

// 1. Clientes. IMPORTANTE: SUPABASE_KEY debe ser la clave service_role (el RLS bloquea a la anon).
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const ADMIN_ID = parseInt(process.env.ADMIN_TELEGRAM_ID, 10);
const MODELO_IA = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
const MODELO_VOZ = process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo';

// 2. Lista blanca: solo el administrador usa el bot
bot.use(async (ctx, next) => {
    if (ctx.from && ctx.from.id === ADMIN_ID) return next();
    console.log(`Acceso denegado al usuario: ${ctx.from?.id}`);
});

bot.start((ctx) =>
    ctx.reply('🤖 Bot de gestión escolar listo. Envíame el consumo, por ejemplo: "15 copias a color para 5to C".')
);

// ---------- Utilidades ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const soles = (n) => `S/ ${Number(n).toFixed(2)}`;
const etiquetaProducto = (p) => `${p.nombre}${p.variante ? ' ' + p.variante : ''}`;
const etiquetaSalon = (s) => `Salón ${s.grado} ${s.seccion}`;
const subtotal = (it) => Math.round(it.cantidad * it.producto.precio * 100) / 100;
const totalItems = (items) => Math.round(items.reduce((acc, it) => acc + subtotal(it), 0) * 100) / 100;

async function consultar(promesa) {
    const { data, error } = await promesa;
    if (error) throw error;
    return data;
}

// Solicitudes pendientes de confirmación (en memoria, caducan a los 10 minutos)
const pendientes = new Map();
// Grupos de consumos recién guardados, para poder deshacerlos (caducan a las 2 horas)
const deshacer = new Map();
setInterval(() => {
    const ahora = Date.now();
    for (const [id, p] of pendientes) if (ahora - p.creado > 10 * 60 * 1000) pendientes.delete(id);
    for (const [id, g] of deshacer) if (ahora - g.creado > 2 * 60 * 60 * 1000) deshacer.delete(id);
}, 5 * 60 * 1000).unref();

// ---------- IA: extracción de datos ----------
const INSTRUCCIONES = `Eres un asistente para una librería/centro de copiado escolar.
Analiza el mensaje del usuario y extrae los datos del consumo. Un mensaje puede incluir VARIOS productos. Responde ÚNICAMENTE con un objeto JSON, sin texto adicional.

Reglas:
1. "cuenta_tipo" solo puede ser "salon", "personal" o "indefinido".
2. Si el mensaje menciona un salón (ej. "quinto C", "5 C", "5to c"), es "salon".
3. Si dice "personal" o "a su cuenta" junto a un profesor, es "personal".
4. Si menciona a un profesor pero NO dice "personal" ni menciona un salón, es "indefinido".
5. Copia el salón y el profesor tal como los dijo el usuario, sin corregirlos ni inventar datos.
6. Si un dato no aparece, usa null.
7. En "items" incluye TODOS los productos mencionados, cada uno con su cantidad. Todos comparten la misma cuenta, salón y profesor.

Formato JSON:
{
  "items": [ { "cantidad": <número entero>, "producto": "<producto tal como lo dijo el usuario>" } ],
  "cuenta_tipo": "salon" | "personal" | "indefinido",
  "salon": "<salón tal como lo dijo, o null>",
  "profesor": "<nombre o apellido del profesor, o null>"
}`;

async function extraerConIA(mensaje) {
    const r = await groq.chat.completions.create({
        model: MODELO_IA,
        messages: [
            { role: 'system', content: INSTRUCCIONES },
            { role: 'user', content: mensaje },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
    });
    return JSON.parse(r.choices[0].message.content);
}

// ---------- Resolución de cuenta y producto contra la base de datos ----------
async function cargarProductos() {
    const filas = await consultar(
        supabase.from('productos').select('id, nombre, variante, aliases, precios(precio, activo)').eq('activo', true)
    );
    return filas
        .map((f) => ({ ...f, precio: f.precios?.find((x) => x.activo)?.precio }))
        .filter((f) => f.precio !== undefined && f.precio !== null);
}

const cargarSalones = () =>
    consultar(supabase.from('salones').select('id, grado, seccion, profesor_id').eq('activo', true));
const cargarProfesores = () =>
    consultar(supabase.from('profesores').select('id, nombre').eq('activo', true));

async function preguntar(ctx, id, texto, opciones) {
    const p = pendientes.get(id);
    p.opciones = opciones;
    await ctx.reply(texto, Markup.inlineKeyboard(opciones.map((o, i) => [Markup.button.callback(o.label, `s:${id}:${i}`)])));
}

async function abortar(ctx, id, mensaje) {
    pendientes.delete(id);
    await ctx.reply(mensaje);
}

// Avanza paso a paso hasta tener producto + destino; si hay duda, pregunta.
async function continuar(ctx, id) {
    const p = pendientes.get(id);
    if (!p) return ctx.reply('⌛ Esa solicitud expiró. Envíala de nuevo.');

    // 1) Productos (uno o varios)
    if (p.items.some((it) => !it.producto)) {
        const catalogo = await cargarProductos();
        for (let i = 0; i < p.items.length; i++) {
            const it = p.items[i];
            if (it.producto) continue;
            const ranking = rankearProductos(it.productoTexto, catalogo);
            if (!ranking.length) return abortar(ctx, id, `❌ No encontré "${it.productoTexto}" en el catálogo. No se registró nada.`);
            const [a, b] = ranking;
            if (b && a.score - b.score < 0.15) {
                return preguntar(ctx, id, `🤔 ¿Cuál producto es "${it.productoTexto}"?`,
                    ranking.slice(0, 3).map((r) => ({ label: `${etiquetaProducto(r.producto)} (${soles(r.producto.precio)})`, item: i, valor: r.producto })));
            }
            it.producto = a.producto;
        }
    }

    // 2) Destino
    if (!p.destino) {
        const salones = await cargarSalones();

        // Caso A: dijo el salón explícitamente
        if (p.cuenta_tipo === 'salon' && p.salonTexto) {
            const clave = claveSalon(p.salonTexto);
            const salon = clave && salones.find((s) => claveSalon(`${s.grado} ${s.seccion}`) === clave);
            if (!salon) return abortar(ctx, id, `❌ No encontré el salón "${p.salonTexto}".`);
            p.destino = { tipo: 'salon', id: salon.id, etiqueta: etiquetaSalon(salon) };
        } else {
            // Caso B: hace falta identificar al profesor
            if (!p.profesorTexto) return abortar(ctx, id, '❌ No entendí el salón ni el profesor. Indica uno de los dos.');
            if (!p.profesor) {
                const encontrados = buscarProfesores(p.profesorTexto, await cargarProfesores());
                if (!encontrados.length) return abortar(ctx, id, `❌ No encontré al profesor "${p.profesorTexto}".`);
                if (encontrados.length > 1) {
                    return preguntar(ctx, id, '🤔 ¿Qué profesor?',
                        encontrados.slice(0, 5).map((x) => ({ label: x.nombre, campo: 'profesor', valor: x })));
                }
                p.profesor = encontrados[0];
            }
            const salonDelProfesor = salones.find((s) => s.profesor_id === p.profesor.id);
            const destinoPersonal = { tipo: 'profesor', id: p.profesor.id, etiqueta: `Cuenta personal de ${p.profesor.nombre}` };
            const destinoSalon = salonDelProfesor && { tipo: 'salon', id: salonDelProfesor.id, etiqueta: etiquetaSalon(salonDelProfesor) };

            if (p.cuenta_tipo === 'personal') {
                p.destino = destinoPersonal;
            } else if (p.cuenta_tipo === 'salon') {
                if (!destinoSalon) return abortar(ctx, id, `❌ ${p.profesor.nombre} no tiene un salón asignado.`);
                p.destino = destinoSalon;
            } else if (!destinoSalon) {
                p.destino = destinoPersonal; // sin salón, solo existe la cuenta personal
            } else {
                return preguntar(ctx, id, `🤔 ¿A qué cuenta se carga lo de ${p.profesor.nombre}?`, [
                    { label: `🏫 ${destinoSalon.etiqueta}`, campo: 'destino', valor: destinoSalon },
                    { label: '👤 Cuenta personal', campo: 'destino', valor: destinoPersonal },
                ]);
            }
        }
    }

    // 3) Confirmación
    const lineas = p.items.map(
        (it) => `• ${it.cantidad} × ${esc(etiquetaProducto(it.producto))} a ${soles(it.producto.precio)} = ${soles(subtotal(it))}`
    );
    await ctx.reply(
        `📋 <b>Confirma el registro</b>\n\n${lineas.join('\n')}\n\n` +
        `💰 Total: <b>${soles(totalItems(p.items))}</b>\n` +
        `📁 Cuenta: <b>${esc(p.destino.etiqueta)}</b>`,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[
                Markup.button.callback('✅ Confirmar', `ok:${id}`),
                Markup.button.callback('❌ Cancelar', `no:${id}`),
            ]]),
        }
    );
}

// ---------- Mensajes de texto ----------
// Procesa un pedido en texto (escrito por el usuario o transcrito de una nota de voz)
async function procesarMensaje(ctx, texto) {
    const espera = await ctx.reply('🧠 Analizando mensaje...');
    try {
        const d = await extraerConIA(texto);
        await ctx.telegram.deleteMessage(ctx.chat.id, espera.message_id).catch(() => {});

        const items = (Array.isArray(d.items) ? d.items : []).map((x) => ({
            cantidad: Number(x?.cantidad),
            productoTexto: x?.producto,
            producto: null,
        }));
        if (!items.length) return ctx.reply('❌ No entendí qué productos registrar. Intenta de nuevo.');
        if (items.length > 10) return ctx.reply('❌ Máximo 10 productos por mensaje.');
        const malo = items.find((x) => !Number.isInteger(x.cantidad) || x.cantidad <= 0 || !x.productoTexto);
        if (malo) {
            return ctx.reply(`❌ No entendí la cantidad o el producto${malo.productoTexto ? ` de "${malo.productoTexto}"` : ''}. Intenta de nuevo.`);
        }

        const id = crypto.randomBytes(4).toString('hex');
        pendientes.set(id, {
            creado: Date.now(),
            items,
            cuenta_tipo: ['salon', 'personal', 'indefinido'].includes(d.cuenta_tipo) ? d.cuenta_tipo : 'indefinido',
            salonTexto: d.salon,
            profesorTexto: d.profesor,
            profesor: null,
            destino: null,
        });
        await continuar(ctx, id);
    } catch (error) {
        console.error('Error procesando mensaje:', error);
        await ctx.reply('❌ Ocurrió un error al procesar el mensaje.');
    }
}

bot.on('text', (ctx) => procesarMensaje(ctx, ctx.message.text));

// ---------- Notas de voz ----------
async function transcribirAudio(buffer, vocabulario) {
    const r = await groq.audio.transcriptions.create({
        file: new File([buffer], 'nota.ogg', { type: 'audio/ogg' }),
        model: MODELO_VOZ,
        language: 'es',
        temperature: 0,
        // La "prompt" de Whisper orienta la ortografía de los términos del negocio
        prompt: `Pedido en una librería escolar. Productos: ${vocabulario}. Salones como 5to C, 3ro A, quinto B.`.slice(0, 600),
        response_format: 'json',
    });
    return (r.text || '').trim();
}

bot.on('voice', async (ctx) => {
    const { file_id, duration } = ctx.message.voice;
    if (duration > 60) return ctx.reply('❌ La nota de voz es muy larga (máximo 60 segundos).');

    const espera = await ctx.reply('🎙️ Escuchando...');
    try {
        const enlace = await ctx.telegram.getFileLink(file_id);
        const respuesta = await fetch(enlace.href);
        if (!respuesta.ok) throw new Error(`No se pudo descargar el audio (${respuesta.status})`);
        const buffer = Buffer.from(await respuesta.arrayBuffer());

        const vocabulario = (await cargarProductos()).map(etiquetaProducto).join(', ');
        const texto = await transcribirAudio(buffer, vocabulario);
        await ctx.telegram.deleteMessage(ctx.chat.id, espera.message_id).catch(() => {});

        if (!texto) return ctx.reply('❌ No pude entender el audio. Intenta de nuevo, más cerca del micrófono.');
        await ctx.reply(`🎙️ Escuché: «${texto}»`);
        await procesarMensaje(ctx, texto);
    } catch (error) {
        console.error('Error con la nota de voz:', error.message);
        await ctx.telegram.deleteMessage(ctx.chat.id, espera.message_id).catch(() => {});
        await ctx.reply('❌ No pude procesar la nota de voz. Intenta de nuevo o escríbelo.');
    }
});

// ---------- Botones ----------
bot.action(/^s:(\w+):(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const [, id, idx] = ctx.match;
    const p = pendientes.get(id);
    const op = p?.opciones?.[Number(idx)];
    if (!op) return ctx.reply('⌛ Esa solicitud expiró. Envíala de nuevo.');
    if (op.item !== undefined) p.items[op.item].producto = op.valor;
    else p[op.campo] = op.valor;
    p.opciones = null;
    await ctx.deleteMessage().catch(() => {});
    try {
        await continuar(ctx, id);
    } catch (e) {
        console.error(e);
        await ctx.reply('❌ Ocurrió un error.');
    }
});

bot.action(/^no:(\w+)$/, async (ctx) => {
    await ctx.answerCbQuery('Cancelado');
    pendientes.delete(ctx.match[1]);
    await ctx.editMessageText('🚫 Registro cancelado.').catch(() => {});
});

bot.action(/^ok:(\w+)$/, async (ctx) => {
    const id = ctx.match[1];
    const p = pendientes.get(id);
    if (!p) {
        await ctx.answerCbQuery('Expiró');
        return ctx.editMessageText('⌛ Esa solicitud expiró. Envíala de nuevo.').catch(() => {});
    }
    pendientes.delete(id); // evita doble registro por doble toque
    await ctx.answerCbQuery('Guardando...');
    try {
        // Un solo INSERT: se guardan todos los productos o ninguno
        const filas = p.items.map((it) => ({
            producto_id: it.producto.id,
            cantidad: it.cantidad,
            precio_unitario: it.producto.precio,
            total: subtotal(it),
            salon_id: p.destino.tipo === 'salon' ? p.destino.id : null,
            profesor_id: p.destino.tipo === 'profesor' ? p.destino.id : null,
            origen: 'telegram',
        }));
        const guardados = await consultar(supabase.from('consumos').insert(filas).select('id'));

        const grupo = crypto.randomBytes(4).toString('hex');
        deshacer.set(grupo, { ids: guardados.map((g) => g.id), creado: Date.now() });

        const lineas = p.items.map((it) => `• ${it.cantidad} × ${esc(etiquetaProducto(it.producto))} = ${soles(subtotal(it))}`);
        await ctx.editMessageText(
            `✅ <b>Registrado</b>\n\n${lineas.join('\n')}\n\n💰 Total: <b>${soles(totalItems(p.items))}</b> → ${esc(p.destino.etiqueta)}`,
            { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('↩️ Deshacer todo', `undo:${grupo}`)]]) }
        );
    } catch (error) {
        console.error('Error guardando consumo:', error);
        await ctx.editMessageText('❌ No se pudo guardar el registro. Intenta de nuevo.').catch(() => {});
    }
});

bot.action(/^undo:(\w+)$/, async (ctx) => {
    const grupo = deshacer.get(ctx.match[1]);
    if (!grupo) {
        return ctx.answerCbQuery('Ya no se puede deshacer desde aquí. Anúlalo desde el panel.', { show_alert: true });
    }
    try {
        const filas = await consultar(
            supabase.from('consumos').update({ anulado: true })
                .in('id', grupo.ids).eq('origen', 'telegram').eq('anulado', false).select('id')
        );
        deshacer.delete(ctx.match[1]);
        await ctx.answerCbQuery(filas.length ? 'Anulado' : 'Ya estaba anulado');
        await ctx.editMessageText('↩️ Registro anulado.').catch(() => {});
    } catch (error) {
        console.error('Error anulando:', error);
        await ctx.answerCbQuery('No se pudo anular');
    }
});

bot.catch((err) => console.error('Error no controlado:', err));

bot.launch();
console.log('Bot de librería escuchando en Telegram...');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
