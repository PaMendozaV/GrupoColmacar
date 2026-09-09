// Carrito simple del catálogo (sin backend): agrega/quita productos,
// calcula el subtotal y arma el mensaje de pedido por WhatsApp.
const colmacar = (() => {
  const NUMERO_WHATSAPP = "584247668718";
  const UMBRAL_MAYOR = 50;
  const CLAVE_STORAGE = "colmacar_carrito";

  // El carrito se guarda en localStorage para que sea el MISMO
  // en Inicio y en Catálogo (son páginas distintas, cada una carga
  // este script de nuevo, así que sin storage cada una tendría su
  // propio carrito aislado).
  function cargarCarritoGuardado() {
    try {
      const crudo = localStorage.getItem(CLAVE_STORAGE);
      if (!crudo) return new Map();
      return new Map(JSON.parse(crudo));
    } catch (error) {
      console.warn("No se pudo leer el carrito guardado:", error);
      return new Map();
    }
  }

  const carrito = cargarCarritoGuardado();

  function guardarCarrito() {
    try {
      localStorage.setItem(CLAVE_STORAGE, JSON.stringify(Array.from(carrito.entries())));
    } catch (error) {
      console.warn("No se pudo guardar el carrito:", error);
    }
  }

  const elLabel = document.getElementById("subtotal-label");
  const elMonto = document.getElementById("subtotal-monto");
  const elBtnWsp = document.getElementById("btn-whatsapp");

  function formatearMonto(valor) {
    return "$" + valor.toFixed(2).replace(".", ",");
  }

  function calcularPrecioUnitario(item) {
    return (item.precioMayor && item.cantidad >= UMBRAL_MAYOR) ? item.precioMayor : item.precioDetal;
  }

  function actualizarBarra() {
    let totalProductos = 0;
    let totalMonto = 0;
    carrito.forEach((item) => {
      totalProductos += item.cantidad;
      totalMonto += item.cantidad * calcularPrecioUnitario(item);
    });

    elLabel.textContent = `Subtotal (${totalProductos} producto${totalProductos === 1 ? "" : "s"})`;
    elMonto.textContent = formatearMonto(totalMonto);

    if (totalProductos === 0) {
      elBtnWsp.setAttribute("aria-disabled", "true");
      elBtnWsp.removeAttribute("href");
    } else {
      elBtnWsp.removeAttribute("aria-disabled");
      elBtnWsp.href = construirEnlaceWhatsapp(totalMonto);
    }
  }

  function construirEnlaceWhatsapp(totalMonto) {
    const lineas = ["Hola, quisiera hacer este pedido:", ""];
    carrito.forEach((item) => {
      const precioUnitario = calcularPrecioUnitario(item);
      const etiquetaPrecio = (item.precioMayor && item.cantidad >= UMBRAL_MAYOR) ? " (precio mayor)" : "";
      lineas.push(`• ${item.nombre} x${item.cantidad}${etiquetaPrecio} — ${formatearMonto(precioUnitario * item.cantidad)}`);
    });
    lineas.push("", `Subtotal: ${formatearMonto(totalMonto)}`);
    const texto = encodeURIComponent(lineas.join("\n"));
    return `https://wa.me/${NUMERO_WHATSAPP}?text=${texto}`;
  }

  function renderizarAccion(contenedor, id) {
    const item = carrito.get(id);

    if (!item) {
      contenedor.innerHTML = `<button type="button" class="btn-agregar" onclick="colmacar.agregarProducto(this)">Añadir al pedido</button>`;
      return;
    }

    contenedor.innerHTML = `
      <div class="selector-cantidad">
        <button type="button" onclick="colmacar.cambiarCantidad('${id}', -1)">−</button>
        <input type="number" min="1" value="${item.cantidad}"
               onchange="colmacar.actualizarCantidadDesdeInput('${id}', this.value)">
        <button type="button" onclick="colmacar.cambiarCantidad('${id}', 1)">+</button>
      </div>
    `;
  }

  function agregarProducto(boton) {
    const contenedor = boton.closest(".card-producto__accion");
    const card = boton.closest(".card-producto");
    const id = card.dataset.id;
    const nombre = card.dataset.nombre;
    const precioDetal = parseFloat(card.dataset.precio);
    const precioMayor = card.dataset.precioMayor ? parseFloat(card.dataset.precioMayor) : null;

    carrito.set(id, { nombre, precioDetal, precioMayor, cantidad: 1 });
    guardarCarrito();
    renderizarAccion(contenedor, id);
    actualizarBarra();
  }

  function actualizarCantidadDesdeInput(id, valor) {
    const item = carrito.get(id);
    if (!item) return;

    let cantidad = parseInt(valor, 10);
    if (isNaN(cantidad) || cantidad < 1) cantidad = 1;

    item.cantidad = cantidad;
    carrito.set(id, item);
    guardarCarrito();

    const contenedor = document.querySelector(`.card-producto__accion[data-id="${id}"]`);
    renderizarAccion(contenedor, id);
    actualizarBarra();
  }

  function cambiarCantidad(id, delta) {
    const item = carrito.get(id);
    if (!item) return;

    item.cantidad += delta;

    const contenedor = document.querySelector(`.card-producto__accion[data-id="${id}"]`);

    if (item.cantidad <= 0) {
      carrito.delete(id);
    } else {
      carrito.set(id, item);
    }
    guardarCarrito();

    renderizarAccion(contenedor, id);
    actualizarBarra();
  }

  // Recorre las tarjetas de producto visibles en la página (las que vinieron
  // del servidor y las que dibuja el buscador en vivo) y pone al día su
  // botón/selector según lo que ya haya en el carrito guardado. Sin esto,
  // una tarjeta que ya tiene 3 unidades en el carrito mostraría igual
  // "Añadir al pedido" en vez del selector de cantidad.
  function sincronizarBotones() {
    document.querySelectorAll(".card-producto__accion[data-id]").forEach((contenedor) => {
      renderizarAccion(contenedor, contenedor.dataset.id);
    });
  }

  function activarAnimacionScroll() {
    const elementosAnimados = document.querySelectorAll(".card-producto, .galeria__grid img");
    if (!elementosAnimados.length) return;

    const prefiereMenosMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefiereMenosMovimiento || !("IntersectionObserver" in window)) {
      elementosAnimados.forEach((el) => el.classList.add("visible"));
      return;
    }

    const observador = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((entrada) => {
          if (entrada.isIntersecting) {
            entrada.target.classList.add("visible");
            observador.unobserve(entrada.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );

    elementosAnimados.forEach((el, indice) => {
      el.style.transitionDelay = `${(indice % 4) * 90}ms`;
      observador.observe(el);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    sincronizarBotones();
    actualizarBarra();
    activarAnimacionScroll();
  });

  return { agregarProducto, cambiarCantidad, actualizarCantidadDesdeInput, sincronizarBotones };
})();