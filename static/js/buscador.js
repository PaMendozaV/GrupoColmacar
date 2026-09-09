function crearBuscadorEnVivo({ inputId, contenedorId, endpoint, renderizarResultado }) {
    const input = document.getElementById(inputId);
    const contenedor = document.getElementById(contenedorId);
    let temporizador = null;

    input.addEventListener('input', () => {
        clearTimeout(temporizador);
        const termino = input.value.trim();

        temporizador = setTimeout(async () => {
            const respuesta = await fetch(`${endpoint}?q=${encodeURIComponent(termino)}`);
            const productos = await respuesta.json();

            contenedor.innerHTML = '';

            if (productos.length === 0) {
                contenedor.innerHTML = '<p class="sin-resultados">No se encontraron productos.</p>';
                return;
            }

            productos.forEach(p => contenedor.insertAdjacentHTML('beforeend', renderizarResultado(p)));

            // Las tarjetas recién insertadas siempre nacen con el botón
            // "Añadir al pedido" por defecto; esto las pone al día con lo
            // que ya haya en el carrito (que ahora es compartido entre
            // Inicio y Catálogo).
            if (typeof colmacar !== 'undefined' && colmacar.sincronizarBotones) {
                colmacar.sincronizarBotones();
            }
        }, 300); // espera 300ms desde la última tecla
    });
}