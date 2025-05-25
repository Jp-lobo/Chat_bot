// Requisitos:
// 1. Tener Node.js instalado
// 2. Ejecuta en consola:
//    npm init -y
//    npm install @whiskeysockets/baileys qrcode-terminal axios

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys")
const { Boom } = require("@hapi/boom")
const qrcode = require("qrcode-terminal")
const axios = require("axios")

// Historial de conversación por usuario
const historiales = {} // clave = número de usuario

const API_KEY = "" // ⬅️ Reemplaza con tu API Key de OpenRouter
const promptBase = "Actúa como un vendedor de libros con acceso a todo el catálogo literario existente, cuentas con todos los libros del mundo existentes en nuestro catalogo. Tu misión es guiar al cliente a la venta de un libro suponiendo que todos valen 5 dolares. Siempre hablas con un tono amable, educado y cercano, como si estuvieras en una librería física atendiendo a un lector curioso.Responde solo cuando el usuario haya terminado de escribir. Espera entre 3 y 5 segundos antes de contestar, simulando una conversación natural. Tus respuestas deben tener una excelente redacción, no deben superar las 50 palabras, usando un lenguaje claro, agradable y con riqueza lingüística, pero nunca técnico ni complicado.Evita ser redundante. No repitas ideas, no uses muletillas ni repitas frases en diferentes formas. Cada respuesta debe avanzar la conversación y aportar algo nuevo. Puedes hacer preguntas que inviten a descubrir gustos de lectura, géneros favoritos o autores conocidos, pero siempre orientadas a recomendar libros específicos y con razones convincentes para leerlos.No promociones libros por moda, sino por afinidad real con lo que el cliente busca. Usa ejemplos, citas breves, contextos o descripciones concisas si ayudan a despertar interés. Evita hablar mucho de ti mismo o del servicio; céntrate en el cliente y sus preferencias lectoras.Tu estilo debe ser fluido, atento, sin exagerar en entusiasmo, pero mostrando una pasión genuina por los libros. Si no tienes certeza de un libro, no inventes. Guía al usuario hacia una mejor opción o pide más detalles.Eres preciso, directo, útil y encantador, como el mejor librero que un lector podría encontrar"

async function obtenerRespuestaIA(mensaje, historial) {
    try {
        const respuesta = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
            model: "openai/gpt-3.5-turbo",
            messages: historial.concat({ role: "user", content: mensaje })
        }, {
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            }
        })

        console.log("✅ Conectado correctamente a OpenRouter.")
        return respuesta.data.choices[0].message.content

    } catch (error) {
        if (error.response) {
            console.error("❌ Error de conexión:")
            console.error("Código:", error.response.status)
            console.error("Mensaje:", error.response.data?.error?.message || "Sin mensaje")
            return `❌ Error ${error.response.status}: ${error.response.data?.error?.message}`
        } else {
            console.error("❌ Error inesperado:", error.message)
            return "❌ Error al conectar con la IA."
        }
    }
}

async function iniciarBot() {
    const { state, saveCreds } = await useMultiFileAuthState("baileys_auth")

    const sock = makeWASocket({ auth: state })

    sock.ev.on("creds.update", saveCreds)

    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0]
        if (!msg.message || msg.key.fromMe) return

        const texto = msg.message.conversation || msg.message.extendedTextMessage?.text
        const numero = msg.key.remoteJid

        if (!historiales[numero]) historiales[numero] = [
            { role: "system", content: promptBase }
        ]

        historiales[numero].push({ role: "user", content: texto })

        const respuestaIA = await obtenerRespuestaIA(texto, historiales[numero])
        historiales[numero].push({ role: "assistant", content: respuestaIA })

        await sock.sendMessage(numero, { text: respuestaIA })
    })

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update

        if (qr) {
            console.log("📱 Escanea este código QR con WhatsApp:")
            qrcode.generate(qr, { small: true })
        }

        if (connection === "close") {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom) &&
                lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut
            console.log("❌ Conexión cerrada. ¿Reconectar?", shouldReconnect)
            if (shouldReconnect) iniciarBot()
        } else if (connection === "open") {
            console.log("✅ Conectado exitosamente a WhatsApp")
        }
    })
}

iniciarBot()
