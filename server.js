require('dotenv').config({ path: './.env' });
// Logs
console.log('[server STARTUP] OPENROUTER_API_KEY Check:', process.env.OPENROUTER_API_KEY ? 'CARGADA (oculta): ' + process.env.OPENROUTER_API_KEY.substring(0, 5) + '...' : '<<<< ¡¡¡ERROR!!! OpenRouter Key UNDEFINED >>>>');
console.log('[server] Iniciando servidor...');
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
const apiLimiter = rateLimit({ windowMs: 15*60*1000, max: 100, message: 'Demasiadas solicitudes.' });
app.use('/api/', apiLimiter);
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

// === Función escapeHtml (VERSIÓN CORRECTA CON ENTIDADES) ===
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe ? String(unsafe) : '';
     return unsafe.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">").replace(/"/g, "'").replace(/'/g, "'");
}
// ===========================================================

// --- Función para llamar a OPENROUTER (SOLO PARA CHAT AHORA) ---
async function callOpenRouter(modelIdentifier, prompt, maxTokens = 800, temperature = 0.6, systemPrompt = "Eres un asistente útil.") {
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
    if (!OPENROUTER_API_KEY) throw new Error("Clave API OpenRouter no configurada.");
    console.log(`[OpenRouter] Llamando API (${modelIdentifier}) - MaxTokens: ${maxTokens}`);
    const messages = [];
    if (systemPrompt) { messages.push({ role: "system", content: systemPrompt }); }
    messages.push({ role: "user", content: prompt });
    try {
        const response = await axios.post(OPENROUTER_API_URL, { model: modelIdentifier, messages: messages, temperature: temperature, max_tokens: maxTokens, siteUrl: 'http://localhost:3000', httpReferrer: 'http://localhost:3000', }, { headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' } });
        // console.log('[OpenRouter] Respuesta recibida:', JSON.stringify(response.data, null, 2)); // Log completo opcional
        const generatedText = response.data?.choices?.[0]?.message?.content;
        if (generatedText === undefined || generatedText === null) {
            console.warn(`[OpenRouter] No se encontró texto en respuesta ${modelIdentifier}. Respuesta completa:`);
            console.warn(JSON.stringify(response.data, null, 2)); // Imprimir toda la respuesta
            return null; // Devolver null para manejarlo después
        }
        console.log(`[OpenRouter] Texto Extraído (${modelIdentifier}) - Longitud: ${generatedText.length}`);
        return generatedText.trim();
    } catch (error) { let e='Problema IA (OpenRouter).'; if(error.response){console.error('OR Error:',error.response.status,error.response.data);const d=error.response.data?.error;if(d?.message)e=`Error OR(${error.response.status}): ${d.message}`;else e=`Error OR(${error.response.status})`;if(error.response.status===401)e='Clave API OR inválida.';if(error.response.status===402)e='Fondos insuficientes OR.';if(error.response.status===429)e='Límite OR.';if(d?.code==='model_not_found')e=`Modelo no encontrado: ${modelIdentifier}`;}else if(error.request)console.error('OR No respuesta:',error.request);else console.error('OR Error req:',error.message);throw new Error(e); }
}

// --- Endpoint para análisis de texto (CONSEJOS - GENERACIÓN LOCAL SIMPLE) ---
app.post('/api/analyze-text', async (req, res) => {
    const socketId = req.body.socketId; 
    const socket = socketId ? io.sockets.sockets.get(socketId) : null;
    const emitStatus = (message, isError = false) => { 
        if (socket) {
            console.log(`[API analyze-text] Emitiendo estado a socket ${socketId}: ${message}, esError: ${isError}`);
            socket.emit('ia_status_update', { message, isError }); 
        } else {
            console.log(`[API analyze-text] No se pudo emitir estado (no socket): ${message}`);
        }
    };

    emitStatus('Generando consejos básicos...');
    console.log('[API analyze-text] Endpoint invocado.');

   try {
       const { text, errors } = req.body;
       
       console.log('[API analyze-text] Texto Recibido (primeros 100 chars):', text ? text.substring(0,100)+"..." : "N/A");
       console.log('[API analyze-text] Errores Recibidos para analizar:', JSON.stringify(errors, null, 2));

       if (!text || !Array.isArray(errors)) {
           console.error('[API analyze-text] Datos inválidos: Falta texto o el array de errores no es válido.');
           emitStatus('Error: Datos de entrada inválidos para generar consejos.', true);
           return res.status(400).json({ success: false, error: 'Datos inválidos para el análisis.' });
       }
       
       console.log(`[API analyze-text] (LOCAL) Recibido ${errors.length} errores para procesar.`);

       const errorsToExplain = errors.map((err, idx) => {
               let extractedText = null; 
               const orig = text; // Texto original completo
               
               console.log(`[API analyze-text] Procesando error #${idx + 1}/${errors.length}: offset=${err.offset}, length=${err.length}, mensaje="${err.message}"`);
               
               if (orig && typeof err.offset === 'number' && typeof err.length === 'number' && 
                   err.offset >= 0 && err.length > 0 && (err.offset + err.length) <= orig.length) {
                   
                   extractedText = orig.substring(err.offset, err.offset + err.length);
                   console.log(`[API analyze-text] Error #${idx + 1} - Texto extraído del original: "${extractedText}"`);
               } else {
                   console.error(`[API analyze-text] Error #${idx + 1} - Fallo en la extracción del texto del error. Detalles:`);
                   console.error(`  - Offset: ${err.offset} (tipo: ${typeof err.offset})`);
                   console.error(`  - Length: ${err.length} (tipo: ${typeof err.length})`);
                   console.error(`  - Longitud del texto original: ${orig ? orig.length : 'N/A'}`);
                   console.error(`  - Condición (offset + length <= orig.length): ${err.offset + err.length} <= ${orig ? orig.length : 'N/A'} (${(err.offset + err.length) <= (orig ? orig.length : 0)})`);
                   // Intentar extraer incluso si hay un pequeño desbordamiento, por si acaso
                   if (orig && typeof err.offset === 'number' && err.offset < orig.length) {
                       extractedText = orig.substring(err.offset, Math.min(err.offset + (err.length || 1), orig.length) );
                       console.warn(`[API analyze-text] Error #${idx + 1} - Intento de extracción flexible: "${extractedText}"`);
                   }
               }
               return { 
                   message: err.message, 
                   errorText: extractedText, // Podría ser null si la extracción falla
                   suggestion: err.replacements && err.replacements.length > 0 && err.replacements[0].value ? err.replacements[0].value : null 
                };
           }).filter(e => {
               // Filtrar errores donde no se pudo extraer el texto del error
               const hasErrorText = !!e.errorText; 
               if (!hasErrorText) {
                   console.warn('[API analyze-text] Filtrando error porque no se pudo extraer errorText. Detalles del error filtrado:', JSON.stringify(e, null, 2));
               }
               return hasErrorText;
           }).slice(0, 5); // Limitar a 5 para no sobrecargar

       console.log(`[API analyze-text] (LOCAL) Número de errores válidos para mostrar después de filtrar: ${errorsToExplain.length}`);

       let analysisHtml = `<div class="tutor-feedback"><h4>Consejos de Profe Amigo:</h4>`;
       if (errorsToExplain.length === 0) {
           // Si no hay errores PARA EXPLICAR (pudieron ser filtrados o no hubo inicialmente),
           // pero LanguageTool sí marcó errores (errors.length > 0), es un caso especial.
           if (errors.length > 0) {
               console.log('[API analyze-text] LanguageTool detectó errores, pero no se pudieron generar explicaciones específicas para ellos (quizás por fallo en extracción de texto).');
               analysisHtml += `<p>Detecté algunos detalles a revisar, pero no pude generar un consejo específico ahora. ¡Sigue intentando!</p>`;
           } else {
               console.log('[API analyze-text] No se detectaron errores o no hay errores para explicar.');
               analysisHtml += `<div class="no-errors-found"><p>¡Muy bien! Parece que no hay errores claros en esta parte. 👍</p></div>`;
           }
       } else {
           analysisHtml += errorsToExplain.map((errData, i) => {
               let simpleExplanation = `Revisa esta parte: <span class="word-incorrect">"${escapeHtml(errData.errorText)}"</span>.`;
               // ... (tu lógica de simpleExplanation existente, asegúrate que escapeHtml se use bien)
               if (errData.message.toLowerCase().includes('concordancia')) simpleExplanation = `Asegúrate que las palabras concuerden (ej. 'el perro', 'las casas'). Revisa: <span class="word-incorrect">"${escapeHtml(errData.errorText)}"</span>.`;
               else if (errData.message.toLowerCase().includes('ortográfi')) simpleExplanation = `Revisa si usaste la letra correcta (b/v, c/s/z, h, etc.) en <span class="word-incorrect">"${escapeHtml(errData.errorText)}"</span>.`;
               else if (errData.message.toLowerCase().includes('tilde') || errData.message.toLowerCase().includes('acento')) simpleExplanation = `Puede que falte un acento (tilde) en <span class="word-incorrect">"${escapeHtml(errData.errorText)}"</span>.`;
               else if (errData.message.toLowerCase().includes('mayúscula')) simpleExplanation = `Recuerda usar mayúscula al empezar o en nombres. Fíjate en <span class="word-incorrect">"${escapeHtml(errData.errorText)}"</span>.`;
               else if (errData.message.toLowerCase().includes('puntuaci')) simpleExplanation = `Revisa si falta un punto, coma o espacio cerca de <span class="word-incorrect">"${escapeHtml(errData.errorText)}"</span>.`;
               
               return `<div class="error-explanation">
                       <p><strong>Error detectado:</strong> <span class="word-incorrect">"${escapeHtml(errData.errorText)}"</span></p>
                       ${errData.suggestion ? `<p><strong>Sugerencia:</strong> <span class="word-correct">"${escapeHtml(errData.suggestion)}"</span></p>` : ''}
                       <p><strong>Descripción del problema:</strong> ${escapeHtml(errData.message)}</p>
                       <p><strong>Consejo:</strong> ${simpleExplanation}</p>
                      </div>`;
           }).join('');
       }
       analysisHtml += `</div>`;
       
       console.log('[API analyze-text] HTML de análisis final que se enviará al cliente (primeros 200 chars):', analysisHtml.substring(0,200)+"...");

       emitStatus('Consejos listos.');
       res.json({ success: true, analysis: analysisHtml });

   } catch (error) {
       console.error('[API analyze-text] (LOCAL) Excepción en el endpoint:', error);
       emitStatus(`Error al generar consejos: ${error.message || 'Error desconocido'}`, true);
       res.status(500).json({ success: false, error: 'Error interno al generar consejos.', details: error.message });
   }
});

// También necesitarás tu función escapeHtml en server.js si no la tienes globalmente
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe ? String(unsafe) : '';
     return unsafe.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">").replace(/"/g, "'").replace(/'/g, "'");
}

// --- Endpoint para generación de EJERCICIOS (LOCAL) ---
app.post('/api/generate-exercises', async (req, res) => {
    const socketId = req.body.socketId; const socket = socketId ? io.sockets.sockets.get(socketId) : null; const emitStatus = (message, isError = false) => { if (socket) socket.emit('ia_status_update', { message, isError }); }; emitStatus('Generando ejercicios...');
    try {
        const { text } = req.body; if (!text || text.length < 10) return res.status(400).json({ error: 'Texto insuficiente.' }); console.log(`[server /api/generate-exercises] (LOCAL) Solicitud: ${text.length} chars`);
        let ex1={p:'c_sa',o:'casa'}, ex2={v:'a',f:'La casa es azul.',n:3}; const words = text.match(/\b[a-záéíóúñü]{4,6}\b/gi)||[]; if(words.length>0){const u=[...new Set(words)];const w=u[Math.floor(Math.random()*u.length)].toLowerCase();const m=Math.floor(w.length/2);const i=m>0?m:1;if(w.length>2&&i<w.length){const f=w.substring(0,i);const s=w.substring(i+1);ex1={p:`${f}_${s}`,o:w};}else{console.warn('No hueco:',w);}}else{console.warn('No palabras Ej1.');} const lets="aeiou";const l=lets[Math.floor(Math.random()*lets.length)];let frag=text.substring(0,80);const p=frag.indexOf('.');if(p>10){frag=frag.substring(0,p+1).trim();}else{frag=text.substring(0,60).trim();if(text.length>60&&text[60]!==' '){const s=frag.lastIndexOf(' ');if(s>0)frag=frag.substring(0,s);}frag+='...';} let count=0;const lf=frag.toLowerCase();const ll=l.toLowerCase();for(let k=0;k<lf.length;k++){let char=lf[k];if('áéíóúñü'.includes(char)){if((char==='á'&&ll==='a')||(char==='é'&&ll==='e')||(char==='í'&&ll==='i')||(char==='ó'&&ll==='o')||((char==='ú'||char==='ü')&&ll==='u'))count++;}else if(char===ll){count++;}} ex2={v:l,f:frag||ex2.f,n:count};
        console.log('Ej1:', ex1); console.log('Ej2:', ex2);
        const exercisesHtml = `<div class="exercises"><h3>¡A Practicar!</h3><div class="exercise"><h4>Ejercicio 1: Completar Palabra</h4><p>Escribe la letra que falta:</p><div class="activity">${escapeHtml(ex1.p)}</div><details><summary>Respuesta</summary><p>${escapeHtml(ex1.o)}</p></details></div><div class="exercise"><h4>Ejercicio 2: Buscar Letra</h4><p>¿Cuántas veces está la letra '${escapeHtml(ex2.v)}'?</p><div class="activity" style="font-style: italic;">"${escapeHtml(ex2.f)}"</div><details><summary>Respuesta</summary><p>Aparece ${ex2.n} ${ex2.n===1?'vez':'veces'}.</p></details></div></div>`;
        await new Promise(resolve => setTimeout(resolve, 300)); emitStatus('Ejercicios listos.');
        res.json({ success: true, exercises: exercisesHtml });
    } catch (error) { console.error('[server /api/generate-exercises] (LOCAL) Error:', error); emitStatus(`Error ejercicios: ${error.message}`, true); res.status(500).json({ success: false, error: 'Error interno crear ejercicios.', details: null }); }
});

// --- Manejo de Conexiones WebSocket (Chat con Mistral, maxTokens 400) ---
io.on('connection', (socket) => {
    console.log('[Socket.IO] Cliente conectado:', socket.id);
    socket.emit('server_message', { message: `¡Hola! Soy tu Profe Amigo. Pregúntame sobre letras, palabras o cómo usar la app. 😊` }); // Mensaje inicial más específico
    socket.on('chat_message_from_client', async (data) => {
        const userMessage = data.message || ''; console.log(`[Socket.IO Chat] Msg ${socket.id}:`, userMessage); if (!userMessage) return;
        try {
            socket.emit('chat_message_from_server', { message: "...", senderType: 'bot_thinking' });

            // === SYSTEM PROMPT MODIFICADO Y ESTRICTO ===
            const CHAT_MODEL = "mistralai/mistral-7b-instruct:free";
            const chatSystemPrompt = `
                **ROL ESTRICTO:** Eres "Profe Amigo", un asistente virtual **EXCLUSIVAMENTE** enfocado en ayudar con la alfabetización básica (leer y escribir) dentro de esta aplicación. Eres muy amable, paciente y siempre respondes de forma **muy breve, clara y sencilla**.

                **TEMAS PERMITIDOS (ÚNICAMENTE):**
                1.  **Letras y Sonidos:** El abecedario, cómo suena una letra, mayúsculas/minúsculas, diferenciar letras (b/d).
                2.  **Sílabas y Palabras:** Separar en sílabas (muy básico), cómo se escribe una palabra simple, significado de palabras muy comunes, ejemplos de palabras con una letra/sílaba.
                3.  **Frases y Puntuación:** Uso básico de punto, coma, mayúscula inicial, signos ¿? ¡!.
                4.  **Lectura Básica:** Ayudar a leer una palabra escrita por el usuario, dar consejos simples como "lee despacio".
                5.  **Escritura Básica:** Recordar espacios, dar ideas simples ("escribe tu nombre").
                6.  **Uso de la App:** Explicar botones (cámara, revisar, micrófono), ejercicios, consejos.
                7.  **Ánimo:** Dar mensajes positivos sobre aprender ("¡Vas bien!", "¡Sigue así!").

                **REGLA FUNDAMENTAL: SI LA PREGUNTA DEL USUARIO NO ESTÁ **DIRECTAMENTE** RELACIONADA CON UNO DE LOS TEMAS PERMITIDOS, **DEBES** RECHAZARLA AMABLEMENTE Y REENFOCAR.** No intentes adaptarte ni responder parcialmente.

                **CÓMO RECHAZAR TEMAS NO PERMITIDOS (EJEMPLOS):**
                *   "¡Hola! Yo solo sé de letras y palabras para ayudarte a leer y escribir. Sobre eso que preguntas no te puedo ayudar. ¿Tienes alguna duda sobre el abecedario?"
                *   "Mi trabajo aquí es ayudarte con la lectura y escritura. Eso que mencionas es muy interesante, pero no es mi especialidad. ¿Necesitas ayuda para escribir alguna palabra?"
                *   "Uy, yo solo entiendo de cosas para aprender a leer y escribir en esta app. ¿Puedo ayudarte con alguna letra o con los ejercicios?"
                *   "Solo puedo responder preguntas sobre cómo leer, escribir o usar esta aplicación. ¿Quieres que te explique cómo funciona la cámara?"

                **PROHIBIDO RESPONDER SOBRE:** Matemáticas, historia, ciencia, geografía, opiniones personales, política, noticias, clima, chistes complejos, programación, temas abstractos o cualquier cosa fuera de la lista estricta de alfabetización y uso de la app.

                **ESTILO:** Usa frases cortas. Lenguaje muy simple. Tono siempre amable y paciente. Puedes usar emojis básicos como 😊👍. Sé breve.
            `;
            // ===========================================

            const botResponse = await callOpenRouter(CHAT_MODEL, userMessage, 300, 0.6, chatSystemPrompt); // Reducir maxTokens y ajustar temperatura si es necesario para brevedad
            if (botResponse !== null) {
                console.log(`[Socket.IO Chat] Resp ${CHAT_MODEL}:`, botResponse);
                socket.emit('chat_message_from_server', { message: botResponse, senderType: 'bot' });
            }
            else {
                console.warn(`[Socket.IO Chat] Respuesta null de ${CHAT_MODEL}`);
                socket.emit('chat_message_from_server', { message: "Lo siento, tuve un problema para generar la respuesta. Intenta de nuevo.", senderType: 'bot_error' }); // Mensaje error más útil
            }
        } catch (error) {
            console.error("[Socket.IO Chat] Error OR:", error);
            // Simplificar mensaje de error para el usuario final
            let userErrorMessage = "Lo siento, ocurrió un error al procesar tu pregunta.";
            if (error.message.includes('Modelo no encontrado')) {
                userErrorMessage = "Lo siento, el modelo de IA no está disponible ahora.";
            } else if (error.message.includes('Fondos insuficientes') || error.message.includes('Límite')) {
                userErrorMessage = "Lo siento, hay un problema temporal con el servicio de IA. Intenta más tarde.";
            } else if (error.message.includes('inválida')) {
                 userErrorMessage = "Error de configuración (clave API)."; // Solo para desarrollo
            }
            socket.emit('chat_message_from_server', { message: userErrorMessage, senderType: 'bot_error' });
        }
    });
    socket.on('disconnect', () => { console.log('[Socket.IO] Cliente desconectado:', socket.id); });
});

// --- Iniciar servidor HTTP ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`\nServidor HTTP/WS corriendo en http://localhost:${PORT}\n[server] Listo.`); });