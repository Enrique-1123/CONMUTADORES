// script.js - VERSIÓN COMPLETA CON AJUSTES MÁS AGRESIVOS PARA PALABRAS SUELTAS Y MENSAJES MEJORADOS

console.log('[script.js] Iniciando aplicación');

document.addEventListener('DOMContentLoaded', function() {
    console.log('[script.js] DOMContentLoaded evento disparado.');

    initializeUIAndSockets();

    function initializeUIAndSockets() {
        console.log('[initializeUI] Inicializando UI, Listeners y Sockets...');

        const inputText = document.getElementById('input-text');
        const outputText = document.getElementById('output-text');
        const errorCount = document.getElementById('error-count');
        const openCameraBtn = document.getElementById('open-camera');
        const captureBtn = document.getElementById('capture-btn');
        const flipCameraBtn = document.getElementById('flip-camera');
        const cameraView = document.getElementById('camera-view');
        const cameraCanvas = document.getElementById('camera-canvas');
        const flashElement = document.getElementById('capture-flash');
        const ocrStatus = document.getElementById('ocr-status');
        const checkTextBtn = document.getElementById('check-text-btn');
        const statusElement = document.getElementById('api-status');
        const chatMessages = document.getElementById('chat-messages');
        const chatInput = document.getElementById('chat-input');
        const chatSendBtn = document.getElementById('chat-send-btn');
        const talkButtonChat = document.getElementById('talk-button');
        const dictateButton = document.getElementById('dictate-button');

        if (!inputText || !outputText || !errorCount || !openCameraBtn || !captureBtn || !flipCameraBtn || !cameraView || !cameraCanvas || !statusElement || !chatMessages || !chatInput || !chatSendBtn || !talkButtonChat || !dictateButton ) {
             console.error("¡ERROR CRÍTICO! Faltan elementos esenciales de la UI en index.html. Revisa los IDs.");
             alert("Error: Faltan elementos en la página. La aplicación no funcionará correctamente.");
             return;
        }

        let stream = null;
        let facingMode = 'environment';
        let debounceTimer;
        const debounceDelay = 750;
        let isCheckingSpelling = false;
        let isCapturing = false;
        let socket = null;

        const synth = window.speechSynthesis;
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        let recognition = null;
        let isListeningForChat = false;

        if (SpeechRecognition) {
            try {
                recognition = new SpeechRecognition();
                recognition.lang = "es-ES";
                recognition.continuous = false;
                recognition.interimResults = false;
                console.log("[SR] API Soportada.");
                recognition.onstart = () => {
                    console.log("[SR] Escuchando...");
                    updateStatusUI("Escuchando...", false);
                    if(isListeningForChat) { if(talkButtonChat) talkButtonChat.classList.add('is-listening'); }
                    else { if(dictateButton) dictateButton.classList.add('is-listening'); }
                };
                recognition.onresult = (event) => {
                    const transcript = event.results[event.results.length - 1][0].transcript;
                    console.log("[SR] Texto:", transcript);
                    if (isListeningForChat) {
                        if (chatInput) chatInput.value = transcript;
                        if (socket?.connected) sendChatMessageViaSocket(transcript);
                        else displayChatMessage('Error: No conectado.', 'system', 'error');
                    } else {
                        if (inputText) {
                            inputText.value += (inputText.value ? ' ' : '') + transcript;
                            inputText.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                        }
                    }
                };
                recognition.onerror = (event) => {
                    console.error("[SR] Error:", event.error);
                    let e="Error rec.";
                    if(event.error==='no-speech')e="No detecté habla.";
                    else if(event.error==='audio-capture')e="Error mic.";
                    else if(event.error==='not-allowed')e="Permiso mic denegado.";
                    else if(event.error==='network')e="Error red rec.";
                    updateStatusUI(e, true);
                };
                recognition.onend = () => {
                    console.log("[SR] Escucha terminada.");
                    if(talkButtonChat) talkButtonChat.classList.remove('is-listening');
                    if(dictateButton) dictateButton.classList.remove('is-listening');
                };
                talkButtonChat.addEventListener("click", () => {
                    if (!recognition) return;
                    try {
                        if(synth?.speaking) synth.cancel();
                        console.log("[SR] Iniciando escucha CHAT...");
                        isListeningForChat = true;
                        recognition.start();
                    } catch(e) {
                        console.error("Error inicio rec CHAT:", e);
                        updateStatusUI("Error inicio escucha.", true);
                    }
                });
                dictateButton.addEventListener("click", () => {
                    if (!recognition) return;
                    try {
                        if(synth?.speaking) synth.cancel();
                        console.log("[SR] Iniciando escucha DICTADO...");
                        isListeningForChat = false;
                        recognition.start();
                    } catch(e) {
                        console.error("Error inicio rec DICTADO:", e);
                        updateStatusUI("Error inicio escucha.", true);
                    }
                });
            } catch (e) {
                console.error("Error creando SpeechRecognition:", e);
                if (talkButtonChat) talkButtonChat.disabled = true;
                if(dictateButton) dictateButton.disabled = true;
            }
        } else {
            console.warn("SR no soportado.");
            if (talkButtonChat) talkButtonChat.disabled = true;
            if (dictateButton) dictateButton.disabled = true;
        }
        if (!synth) {
            console.warn("SS no soportado.");
        } else {
            setTimeout(() => { synth.getVoices(); }, 500);
            synth.onvoiceschanged = () => {
                console.log(`[Speech] Voces: ${synth.getVoices().length}`);
                synth.onvoiceschanged = null;
            };
        }

        try {
            if (typeof io === 'undefined') { throw new Error('Socket.IO client no cargado.'); }
            socket = io();
            window.socket = socket;
            
            socket.on('connect', () => {
                console.log('[Socket.IO] Conectado:', socket.id);
                displayChatMessage('Conectado.', 'system');
                if (window.socket) window.socket.id = socket.id;
            });
            socket.on('disconnect', () => {
                console.log('[Socket.IO] Desconectado.');
                displayChatMessage('Desconectado.', 'system', 'error');
                if (window.socket) window.socket.id = null;
            });
            socket.on('server_message', (data) => {
                displayChatMessage(data.message, 'server');
            });
            socket.on('ia_status_update', (data) => {
                updateStatusUI(data.message, data.isError);
            });
            socket.on('chat_message_from_server', (data) => {
                console.log('Msg chat server:', data.message);
                const t = chatMessages?.querySelector('.message-thinking');
                if (t) t.remove();
                displayChatMessage(data.message, 'server', data.senderType);
                if (data.senderType === 'bot' && data.message) speakText(data.message);
            });
            
            if (chatSendBtn && chatInput) {
                chatSendBtn.addEventListener('click', () => sendChatMessageViaSocket(chatInput.value));
                chatInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') { sendChatMessageViaSocket(chatInput.value); }
                });
            } else {
                console.warn('Elementos del Chat no encontrados en el DOM.');
            }
        } catch (error) {
            console.error("Error Socket.IO:", error);
            if(statusElement) updateStatusUI("Error conexión chat.", true);
        }

        openCameraBtn.addEventListener('click', toggleCamera);
        flipCameraBtn.addEventListener('click', flipCamera);
        if (captureBtn) {
             captureBtn.addEventListener('click', captureText);
        }

        inputText.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            const t = inputText.value;
            if (t.trim().length >= 1) { 
                debounceTimer = setTimeout(() => checkSpelling(t), debounceDelay);
            } else {
                if (outputText) outputText.innerHTML = '';
                if (errorCount) errorCount.textContent = '0 errores';
                const f = document.getElementById('ai-feedback');
                if (f) f.innerHTML = '';
            }
        });
        if (checkTextBtn) {
            checkTextBtn.addEventListener('click', () => {
                clearTimeout(debounceTimer);
                if (inputText) checkSpelling(inputText.value);
            });
        }

        function displayChatMessage(message, sender = 'server', senderType = '') {
            if (!chatMessages) return;
            const m = document.createElement('div');
            m.classList.add('chat-message');
            if (senderType === 'bot_thinking') m.classList.add('message-thinking');
            else if (senderType === 'bot_error') m.classList.add('message-server', 'message-error');
            else if (sender === 'user') m.classList.add('message-user');
            else if (sender === 'system') m.classList.add('message-system');
            else m.classList.add('message-server');
            m.textContent = message;
            chatMessages.appendChild(m);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        function updateStatusUI(message, isError = false) {
            if (!statusElement) return;
            statusElement.textContent = message;
            if (isError) { statusElement.classList.add('error-message'); }
            else { statusElement.classList.remove('error-message'); }
            setTimeout(() => {
                if (statusElement.textContent === message) {
                    statusElement.textContent = '';
                    statusElement.classList.remove('error-message');
                }
            }, 5000);
        }
        
        function sendChatMessageViaSocket(message) {
            message = message.trim();
            if (message && socket?.connected) {
                displayChatMessage(message, 'user');
                socket.emit('chat_message_from_client', { message: message });
                if (chatInput) chatInput.value = '';
            } else if (!socket?.connected) {
                displayChatMessage('No conectado para enviar mensaje.', 'system', 'error');
            }
        }

        async function toggleCamera() {
            console.log('[Camera] Toggle');
            if (!openCameraBtn || !captureBtn || !flipCameraBtn || !cameraView) return;
            if (stream) {
                stopCamera();
            } else {
                try {
                    openCameraBtn.disabled = true;
                    openCameraBtn.innerHTML = '...Abriendo Cámara';
                    stream = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
                        audio: false
                    });
                    cameraView.srcObject = stream;
                    await new Promise((res, rej) => { cameraView.onloadedmetadata = res; cameraView.onerror = rej });
                    await cameraView.play();
                    openCameraBtn.innerHTML = '<i class="fas fa-video-slash"></i> Desactivar Cámara';
                    captureBtn.disabled = false;
                    flipCameraBtn.disabled = false;
                    cameraView.style.display = 'block';
                    if (cameraCanvas) cameraCanvas.style.display = 'none';
                } catch (e) {
                    console.error('Error al acceder a la cámara:', e);
                    alert('Error al activar la cámara. Asegúrate de dar permisos.');
                    openCameraBtn.innerHTML = '<i class="fas fa-camera"></i> Activar Cámara';
                    stopCamera();
                } finally {
                    openCameraBtn.disabled = false;
                }
            }
        }

        async function flipCamera() {
            if (!stream || !openCameraBtn) return;
            facingMode = facingMode === 'user' ? 'environment' : 'user';
            console.log('Cambiando a cámara:', facingMode);
            stopCamera();
            await toggleCamera();
        }

        function stopCamera() {
            if (stream) {
                stream.getTracks().forEach(t => t.stop());
                stream = null;
                console.log('Cámara detenida');
            }
            if (cameraView) cameraView.srcObject = null;
            if (cameraView) cameraView.style.display = 'none';
            if (cameraCanvas) cameraCanvas.style.display = 'none';
            if (openCameraBtn) openCameraBtn.innerHTML = '<i class="fas fa-camera"></i> Activar Cámara';
            if (captureBtn) captureBtn.disabled = true;
            if (flipCameraBtn) flipCameraBtn.disabled = true;
            if (ocrStatus) ocrStatus.style.display = 'none';
        }

        // --- OCR con TESSERACT.JS (Ajustado para palabras sueltas y mensajes mejorados) ---
        async function captureText() {
            if (typeof Tesseract === 'undefined') {
                console.error("OCR Error: Tesseract.js no está cargado.");
                if (outputText) outputText.innerHTML = `<div class="error">Error: La herramienta para leer texto no está lista.</div>`;
                return;
            }
            if (!stream || isCapturing || !cameraCanvas || !inputText || !outputText || !errorCount || !captureBtn || !ocrStatus) {
                console.warn('OCR: No se puede iniciar la captura.');
                return;
            }

            console.log('OCR Iniciando...');
            isCapturing = true;
            captureBtn.disabled = true;
            captureBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Leyendo...';
            ocrStatus.style.display = 'block';
            ocrStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparando imagen...';
            inputText.value = "";
            outputText.innerHTML = "";
            errorCount.textContent = '0 errores';

            if (flashElement) {
                flashElement.classList.add('flashing');
                setTimeout(() => flashElement.classList.remove('flashing'), 300);
            }

            const ctx = cameraCanvas.getContext('2d', { willReadFrequently: true });
            if (!ctx || !cameraView.videoWidth || !cameraView.videoHeight) {
                console.error('OCR Error: Contexto de canvas o dimensiones de video no disponibles.');
                isCapturing = false;
                captureBtn.disabled = false;
                captureBtn.innerHTML = '<i class="fas fa-magic"></i> Capturar Texto';
                ocrStatus.style.display = 'none';
                if (outputText) outputText.innerHTML = `<div class="error">Hubo un problema al preparar la cámara.</div>`;
                return;
            }

            cameraCanvas.width = cameraView.videoWidth;
            cameraCanvas.height = cameraView.videoHeight;

            if (facingMode === 'user') {
                ctx.save();
                ctx.scale(-1, 1);
                ctx.drawImage(cameraView, -cameraCanvas.width, 0, cameraCanvas.width, cameraCanvas.height);
                ctx.restore();
            } else {
                ctx.drawImage(cameraView, 0, 0, cameraCanvas.width, cameraCanvas.height);
            }

            try {
                const imageData = ctx.getImageData(0, 0, cameraCanvas.width, cameraCanvas.height);
                const data = imageData.data;
                // MODIFICADO: Umbral de preprocesamiento. EXPERIMENTA con este valor (ej. 110, 120, 130, 140)
                const threshold = 120; 

                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const grayscale = 0.299 * r + 0.587 * g + 0.114 * b;
                    const binaryColor = grayscale > threshold ? 255 : 0;
                    data[i] = binaryColor;
                    data[i + 1] = binaryColor;
                    data[i + 2] = binaryColor;
                }
                ctx.putImageData(imageData, 0, 0);
            } catch (preprocError) {
                console.error("Error durante el preprocesamiento de imagen:", preprocError);
            }

            try {
                ocrStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analizando la imagen...';
                const imgUrl = cameraCanvas.toDataURL('image/png');

                if (!imgUrl || imgUrl === 'data:,') {
                    throw new Error("No se pudo generar la URL de la imagen del canvas.");
                }

                const worker = await Tesseract.createWorker('spa', 1, {
                    logger: m => {
                        if (ocrStatus) {
                            if (m.status === 'recognizing text') {
                                const p = (m.progress * 100).toFixed(0);
                                ocrStatus.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Leyendo texto: ${p}%`;
                            } else if (m.status && !m.status.startsWith('terminate')) {
                                ocrStatus.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${m.status}...`;
                            }
                        }
                    }
                });
                
                // MODIFICADO: tessedit_pageseg_mode.
                // '11': Trata la imagen como una sola palabra en una línea. Ideal para palabras sueltas.
                // '8': Asume una sola palabra.
                // '10': Asume un solo carácter (si es letra por letra).
                // '7': Trata la imagen como una sola línea de texto.
                // EXPERIMENTA con '11', '8', '10', o '7' para ver cuál funciona mejor.
                await worker.setParameters({
                    tessedit_pageseg_mode: '11', 
                    // Opcional: Lista blanca de caracteres. Útil si esperas letras específicas.
                    // tessedit_char_whitelist: 'abcdefghijklmnñopqrstuvwxyzáéíóúüÁÉÍÓÚÜ0123456789',
                });

                const { data: { text: recText } } = await worker.recognize(imgUrl);
                console.log('OCR Texto Reconocido Directo:', recText);
                await worker.terminate();
                console.log('OCR Worker terminado.');

                // Aplicar limpieza menos agresiva o solo si el texto es más largo
                let processedText = recText.trim(); // Trim inicial
                if (processedText.length > 3) { // Solo aplicar limpieza más profunda si hay algo de texto
                    processedText = cleanText(processedText);
                }
                
                console.log('OCR Texto Procesado:', processedText);

                if (processedText) {
                    inputText.value = processedText;
                    if (typeof checkSpelling === 'function') {
                        checkSpelling(processedText);
                    }
                } else {
                    console.log('Tesseract no devolvió texto útil.');
                    // MODIFICADO: Mensaje más amigable
                    if (outputText) outputText.innerHTML = `<div style="text-align: center; padding: 10px;">No pude leer el texto esta vez. ¿Probamos de nuevo? Asegúrate que haya buena luz. 😊</div>`;
                }
            } catch (err) {
                console.error("Error durante el reconocimiento OCR con Tesseract:", err);
                inputText.value = "";
                let eMsg = 'Hubo un problema al intentar leer el texto.';
                if (err && err.message) {
                    if (err.message.includes('NetworkError') || err.message.includes('Failed to fetch')) {
                        eMsg = "Error de red al cargar la herramienta de lectura.";
                    } else if (err.message.includes('load_lang_model') || err.message.includes('.traineddata')) {
                         eMsg = "Error al cargar el modelo de lenguaje para leer.";
                    } else if (err.message.includes('SetImage') || err.message.includes('image') || err.message.includes('pixReadMemPng')) {
                        eMsg = "Error al procesar la imagen para leerla.";
                    }
                }
                if (outputText) {
                    outputText.innerHTML = `<div class="error"><i class="fas fa-exclamation-triangle"></i> ${eMsg}</div>`;
                }
            } finally {
                if (ocrStatus) ocrStatus.style.display = 'none';
                if (captureBtn) {
                    captureBtn.disabled = false;
                    captureBtn.innerHTML = '<i class="fas fa-magic"></i> Capturar Texto';
                }
                isCapturing = false;
                console.log('Proceso de captura OCR finalizado.');
            }
        }

        // MODIFICADO: cleanText menos agresivo inicialmente
        function cleanText(text) {
            if (!text) return '';
            // Quita múltiples espacios y saltos de línea.
            let cleaned = text.replace(/\s+/g, ' ').trim();
            // Permite más caracteres. Si sigue dando problemas, esta regex se puede hacer más permisiva aún.
            // Esta permite letras (incluyendo acentuadas y ñ), números y signos de puntuación comunes.
            cleaned = cleaned.replace(/[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜ .,¿?¡!;:_()%#@*-]/g, '');
            return cleaned;
        }

        async function checkSpelling(textToCheck) {
            console.log('CheckSpelling para:', textToCheck.substring(0, 30) + '...');
            if (!outputText || !errorCount) return;
            
            if (!textToCheck.trim() || isCheckingSpelling) {
                if (!textToCheck.trim()) { 
                    outputText.innerHTML = '';
                    errorCount.textContent = '0 errores';
                }
                return;
            }

            isCheckingSpelling = true;
            outputText.innerHTML = '<div class="loading">...Revisando</div>';
            errorCount.textContent = '';
            try {
                const r = await fetch('https://api.languagetool.org/v2/check', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
                    body: new URLSearchParams({ text: textToCheck, language: 'es', enabledOnly: 'false' })
                });
                console.log('LT Status:', r.status);
                if (!r.ok) {
                    let e = `HTTP ${r.status}`;
                    try { let d = await r.json(); e = `(${r.status}) ${d.message || e}` } catch { }
                    throw new Error(e);
                }
                const d = await r.json();
                console.log('LT Data matches:', d.matches.length);
                displayCorrectedText(textToCheck, d.matches);
                const n = d.matches.length;
                errorCount.textContent = `${n} ${n === 1 ? 'error' : 'errores'} detectados`;
                console.log('Disparando textCorrected (true)');
                document.dispatchEvent(new CustomEvent('textCorrected', { detail: { text: textToCheck, errors: d.matches, success: true } }));
            } catch (e) {
                console.error('CheckSpelling Error:', e);
                outputText.innerHTML = `<div class="error">Error al revisar el texto.<br>(${e.message || 'Problema desconocido'})</div>`;
                errorCount.textContent = 'Error';
                console.log('Disparando textCorrected (false)');
                document.dispatchEvent(new CustomEvent('textCorrected', { detail: { text: textToCheck, errors: [], success: false, error: e.message || 'Fallo LanguageTool.' } }));
            } finally {
                isCheckingSpelling = false;
                console.log('CheckSpelling Finalizada.');
            }
        }

        function displayCorrectedText(originalText, matches) {
            if (!outputText) return;
            let h = '';
            let l = 0;
            matches.sort((a, b) => a.offset - b.offset);
            matches.forEach(m => {
                if (m.offset > l) h += escapeHtml(originalText.substring(l, m.offset));
                const t = originalText.substring(m.offset, m.offset + m.length);
                const p = m.replacements?.[0]?.value ? `Sugerencia: ${m.replacements[0].value}` : m.message;
                h += `<span class="incorrect" title="${escapeHtml(p)}">${escapeHtml(t)}</span>`;
                l = m.offset + m.length;
            });
            if (l < originalText.length) h += escapeHtml(originalText.substring(l));
            outputText.innerHTML = h || '<span class="correct">¡Texto revisado! No encontré errores. 👍</span>';
        }

        function escapeHtml(unsafe) {
            if (typeof unsafe !== 'string') return unsafe ? String(unsafe) : '';
             return unsafe.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">").replace(/"/g, "'").replace(/'/g, "'");
        }
        
        function speakText(text) {
            if (!synth || !text) { console.log("Saltando speakText: No synth o no text."); return; }
            if (synth.speaking) {
                console.log("[Speech] Cancelando habla anterior...");
                synth.cancel();
                setTimeout(() => startSpeaking(text), 150);
            } else {
                startSpeaking(text);
            }
        }

        function startSpeaking(text) {
            console.log("[Speech] Intentando hablar:", text.substring(0, 40) + "...");
            const sentences = text.split(/(?<=[.!?\n])\s+/).filter(s => s.trim().length > 0);
            if (!sentences || sentences.length === 0) {
                if (text.trim()) sentences.push(text.trim());
                else { console.log("[Speech] No hay texto para hablar."); return; }
            }
            let sentenceIndex = 0;

            function speakNextSentence() {
                if (!synth || sentenceIndex >= sentences.length) {
                    console.log("[Speech] Todas las oraciones habladas.");
                    return;
                }
                const utterance = new SpeechSynthesisUtterance(sentences[sentenceIndex].trim());
                utterance.lang = "es-ES";
                
                let voices = synth.getVoices();
                if (voices.length === 0) {
                    const listener = () => {
                        console.log("[Speech] Voces cargadas (onvoiceschanged).");
                        voices = synth.getVoices();
                        synth.onvoiceschanged = null; 
                        speakNextSentence();
                    };
                    if (synth.onvoiceschanged === null) { 
                        synth.onvoiceschanged = listener;
                    }
                    console.log("[Speech] Esperando a que se carguen las voces...");
                    return; 
                }
                
                let spanishVoice = voices.find(v => v.lang === "es-ES" && /Google|Microsoft|Helena|Laura/i.test(v.name)) ||
                                   voices.find(v => v.lang === "es-MX" && /Google|Microsoft|Paulina/i.test(v.name)) ||
                                   voices.find(v => v.lang.startsWith("es-")) ||
                                   voices.find(v => v.default && v.lang.startsWith("es"));
                
                if (spanishVoice) {
                    utterance.voice = spanishVoice;
                    console.log("[Speech] Usando voz:", spanishVoice.name);
                } else {
                    console.warn("[Speech] No se encontró una voz en español preferida. Usando la voz por defecto.");
                }
                
                utterance.onend = () => {
                    console.log("[Speech] Oración terminada:", sentences[sentenceIndex].trim().substring(0,30)+"...");
                    sentenceIndex++;
                    speakNextSentence();
                };
                utterance.onerror = (e) => {
                    console.error("[Speech] Error en utterance:", e);
                    sentenceIndex++;
                    speakNextSentence();
                };
                
                console.log("[Speech] Hablando oración:", sentences[sentenceIndex].trim().substring(0,30)+"...");
                synth.speak(utterance);
            }
            speakNextSentence();
        }

        console.log("[script.js] Aplicación inicializada.");

    } // Fin de initializeUIAndSockets

}); // Fin de DOMContentLoaded