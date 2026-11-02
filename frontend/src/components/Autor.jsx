// Autor de los créditos: su nombre y, debajo, su imagen.
// Si la imagen no existe o no carga, se muestra un recuadro con la inicial del nombre.
import { useState } from 'react';

export default function Autor({ nombre, imagen }) {
  const [fallo, setFallo] = useState(false);

  return (
    <article className="autor">
      <h3 className="autor__nombre">{nombre}</h3>
      {fallo ? (
        <div className="autor__imagen autor__imagen--vacia" role="img" aria-label={`Imagen de ${nombre}`}>
          {nombre[0]}
        </div>
      ) : (
        <img className="autor__imagen" src={imagen} alt={`Imagen de ${nombre}`} onError={() => setFallo(true)} />
      )}
    </article>
  );
}
