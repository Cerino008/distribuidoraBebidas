/**
 * navigation.js - Maneja la funcionalidad del menú móvil
 * Controla la apertura y cierre del menú hamburguesa en dispositivos móviles
 */

// Espera a que el DOM esté completamente cargado antes de ejecutar el código
document.addEventListener("DOMContentLoaded", () => {
  
  // ===== OBTENER ELEMENTOS DEL DOM =====
  const botonMenu = document.getElementById("menu-toggle");
  const menuNavegacion = document.getElementById("nav-links");

  // ===== VALIDACIÓN DE ELEMENTOS =====
  // Verifica que los elementos necesarios existan en el DOM
  if (!botonMenu || !menuNavegacion) {
    console.error("Error: No se encontraron los elementos del menú de navegación");
    return;
  }

  // ===== CONFIGURACIÓN DEL EVENT LISTENER =====
  /**
   * Event listener para el clic en el botón del menú hamburguesa
   * Alterna la clase 'active' en el menú de navegación para mostrarlo/ocultarlo
   */
  botonMenu.addEventListener("click", () => {
    menuNavegacion.classList.toggle("active");
    
    // Opcional: Feedback visual en consola para desarrollo
    console.log("Menú " + (menuNavegacion.classList.contains("active") ? "abierto" : "cerrado"));
  });

  // ===== MEJORA OPCIONAL: CERRAR MENÚ AL HACER CLIC EN UN ENLACE =====
  /**
   * Cierra el menú automáticamente cuando se hace clic en un enlace
   * Útil para dispositivos móviles después de seleccionar una opción
   */
  const enlacesMenu = menuNavegacion.querySelectorAll("a");
  enlacesMenu.forEach(enlace => {
    enlace.addEventListener("click", () => {
      menuNavegacion.classList.remove("active");
    });
  });

  // ===== MEJORA OPCIONAL: CERRAR MENÚ AL HACER CLIC FUERA =====
  /**
   * Cierra el menú cuando se hace clic fuera de él
   * Mejora la experiencia de usuario en dispositivos móviles
   */
  document.addEventListener("click", (evento) => {
    const esClicEnMenu = menuNavegacion.contains(evento.target);
    const esClicEnBotonMenu = botonMenu.contains(evento.target);
    
    if (!esClicEnMenu && !esClicEnBotonMenu && menuNavegacion.classList.contains("active")) {
      menuNavegacion.classList.remove("active");
    }
  });

});