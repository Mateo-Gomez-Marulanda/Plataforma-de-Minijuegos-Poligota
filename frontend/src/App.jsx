// Define las pantallas del sitio. Cada ruta es un escenario independiente dentro de la misma web.
import { Route, Routes } from 'react-router-dom';
import Inicio from './pages/Inicio.jsx';
import Juegos from './pages/Juegos.jsx';
import Creditos from './pages/Creditos.jsx';
import JuegoSudoku from './pages/JuegoSudoku.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Inicio />} />
      <Route path="/juegos" element={<Juegos />} />
      <Route path="/juegos/sudoku" element={<JuegoSudoku />} />
      <Route path="/creditos" element={<Creditos />} />
      <Route path="*" element={<Inicio />} />
    </Routes>
  );
}
