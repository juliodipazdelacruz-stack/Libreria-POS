/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        tinta: { DEFAULT: '#1B2A5B', oscuro: '#121C40' }, // azul de tinta / papel carbón
        papel: '#F3F4F8',
        regla: '#D8DCE6', // líneas de cuaderno contable
        texto: '#1D2433',
        suave: '#5D6578',
        resaltador: '#FFE45C', // marcador amarillo: solo para lo que se debe
        deuda: '#B42318',
        aldia: '#1E7B4F',
      },
      fontFamily: {
        titulo: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        cuerpo: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
