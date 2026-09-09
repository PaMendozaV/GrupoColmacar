// Valida el formulario de nuevo/editar producto ANTES de enviarlo al servidor,
// para evitar que llegue a la base de datos algo que la va a rechazar
// (o, peor, que la BD lo trunque en silencio).
//
// Límites que reflejan las columnas reales de la BD (ver inicio.py):
//   nombre_producto  -> db.String(100)
//   precio_producto  -> db.Numeric(10,2)  => hasta 99.999.999,99
//   precio_mayor     -> db.Numeric(10,2)
//   url_imagen       -> db.String(100)    (guarda la URL que devuelve ImageKit,
//                        que ya incluye el nombre del archivo subido, así que
//                        un nombre de archivo largo puede hacer que la URL
//                        final no quepa en la columna)
(() => {
  const LIMITES = {
    NOMBRE_MAX: 100,
    PRECIO_MAX: 99999999.99,
    NOMBRE_IMAGEN_MAX: 60, // deja margen para el dominio/ruta que agrega ImageKit
  };

  function mostrarError(input, mensaje) {
    limpiarError(input);
    const small = document.createElement('small');
    small.className = 'campo-error';
    small.textContent = mensaje;
    input.insertAdjacentElement('afterend', small);
    input.classList.add('campo-invalido');
  }

  function limpiarError(input) {
    input.classList.remove('campo-invalido');
    const siguiente = input.nextElementSibling;
    if (siguiente && siguiente.classList.contains('campo-error')) {
      siguiente.remove();
    }
  }

  function limpiarTodosLosErrores(form) {
    form.querySelectorAll('.campo-error').forEach((el) => el.remove());
    form.querySelectorAll('.campo-invalido').forEach((el) => el.classList.remove('campo-invalido'));
  }

  function validarPrecio(input, { requerido }) {
    const valor = input.value.trim();

    if (!valor) {
      if (requerido) {
        mostrarError(input, 'Ingresa un precio.');
        return false;
      }
      return true; // campo opcional vacío, está bien
    }

    const numero = Number(valor);

    if (Number.isNaN(numero)) {
      mostrarError(input, 'Ese precio no es un número válido.');
      return false;
    }
    if (numero <= 0) {
      mostrarError(input, 'El precio debe ser mayor a 0.');
      return false;
    }
    if (numero > LIMITES.PRECIO_MAX) {
      mostrarError(input, `El precio es demasiado alto (máximo $${LIMITES.PRECIO_MAX.toLocaleString('es-VE')}).`);
      return false;
    }
    return true;
  }

  function validarFormularioProducto(form) {
    limpiarTodosLosErrores(form);
    let esValido = true;

    const inputNombre = form.querySelector('input[name="nombre"]');
    if (inputNombre) {
      const nombre = inputNombre.value.trim();
      if (!nombre) {
        mostrarError(inputNombre, 'El nombre del producto es obligatorio.');
        esValido = false;
      } else if (nombre.length > LIMITES.NOMBRE_MAX) {
        mostrarError(
          inputNombre,
          `El nombre es muy largo (${nombre.length}/${LIMITES.NOMBRE_MAX} caracteres). Acórtalo.`
        );
        esValido = false;
      }
    }

    const inputPrecio = form.querySelector('input[name="precio"]');
    if (inputPrecio && !validarPrecio(inputPrecio, { requerido: true })) {
      esValido = false;
    }

    const inputPrecioMayor = form.querySelector('input[name="precio_mayor"]');
    if (inputPrecioMayor && !validarPrecio(inputPrecioMayor, { requerido: false })) {
      esValido = false;
    }

    const inputImagen = form.querySelector('input[name="imagen"]');
    if (inputImagen && inputImagen.files && inputImagen.files[0]) {
      const nombreArchivo = inputImagen.files[0].name;
      if (nombreArchivo.length > LIMITES.NOMBRE_IMAGEN_MAX) {
        // El input file está oculto (hidden) y el usuario ve un <label> como
        // disparador, así que mostramos el error junto al label visible.
        const disparador = form.querySelector(`label[for="${inputImagen.id}"]`) || inputImagen;
        mostrarError(
          disparador,
          `El nombre de la imagen es muy largo (${nombreArchivo.length}/${LIMITES.NOMBRE_IMAGEN_MAX} caracteres). Renómbrala antes de subirla.`
        );
        esValido = false;
      }
    }

    return esValido;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const form = document.querySelector('.tarjeta-formulario form');
    if (!form) return;

    form.addEventListener('submit', (evento) => {
      if (!validarFormularioProducto(form)) {
        evento.preventDefault();
        const primerError = form.querySelector('.campo-invalido, .campo-error');
        if (primerError) primerError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });

    // Limpia el error de un campo apenas el usuario lo corrige.
    form.querySelectorAll('input[name="nombre"], input[name="precio"], input[name="precio_mayor"]').forEach((input) => {
      input.addEventListener('input', () => limpiarError(input));
    });
  });
})();
