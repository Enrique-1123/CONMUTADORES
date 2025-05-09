// ia/exercisesGenerator.js
console.log('[exercisesGenerator] Script cargado.');

class ExerciseGenerator {
    constructor() {
        this.endpoint = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
            ? 'http://localhost:3000/api/generate-exercises' : '/api/generate-exercises';
        this.minLength = 10;
        console.log('ExerciseGenerator inicializado. Endpoint:', this.endpoint);
        this.container = document.getElementById('exercises-container');
        this.button = document.getElementById('generate-exercises-btn');
        this.statusElement = document.getElementById('api-status');
    }

    async generateExercises(text) {
        if (!this.container || !this.button) { console.error('Contenedor/botón ejercicios no encontrado.'); return; }
        console.log(`[exercisesGenerator] Solicitando ejercicios...`);

        // --- AJAX VISUAL: Estado de Carga ---
        this.container.innerHTML = ''; // Limpiar previo
        this.container.classList.remove('has-error');
        this.container.classList.add('is-loading');
        this.button.disabled = true;
        this.button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando Ejercicios...';
        if (this.statusElement) this.statusElement.textContent = 'Preparando ejercicios...';
        if (this.statusElement) this.statusElement.classList.remove('error-message');
        // ---

         const socketId = window.socket && window.socket.id ? window.socket.id : null;
         console.log('[exercisesGenerator] Usando socketId:', socketId);

        try {
            if (!text || text.trim().length < this.minLength) throw new Error(`Texto muy corto.`);

            const response = await fetch(this.endpoint, {
                method: 'POST', headers: { 'Content-Type': 'application/json', },
                body: JSON.stringify({ text: text.substring(0, 1500), socketId: socketId })
            });

            // Limpiar estado (servidor enviará "listo" por socket)

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Error desconocido servidor.' }));
                 if (this.statusElement) { this.statusElement.textContent = `Error ejercicios: ${errorData.error || response.status}`; this.statusElement.classList.add('error-message'); }
                throw new Error(errorData.error || `Error servidor (${response.status}).`);
            }

            const data = await response.json();

            // Limpiar estado si éxito
            // if (this.statusElement && data.success) this.statusElement.textContent = '';

            if (data.success && data.exercises) {
                this.container.innerHTML = data.exercises; // Mostrar ejercicios
            } else {
                throw new Error(data.error || 'No se recibieron ejercicios válidos.');
            }
        } catch (error) {
            console.error('[exercisesGenerator] Error:', error);
            this.container.innerHTML = `<div class="error-display"><i class="fas fa-exclamation-triangle"></i> ${error.message || 'Fallo al crear ejercicios.'}</div>`;
            this.container.classList.add('has-error');
            if (this.statusElement && !this.statusElement.classList.contains('error-message')) {
                 this.statusElement.textContent = `Error ejercicios: ${error.message}`;
                 this.statusElement.classList.add('error-message');
            }
        } finally {
             this.container.classList.remove('is-loading');
             this.button.disabled = false;
             this.button.innerHTML = '<i class="fas fa-plus-circle"></i> Crear Nuevos Ejercicios';
             console.log('[exercisesGenerator] Generación finalizada.');
        }
    }
}
