/**
 * LLM Chat App Frontend - Night Mode & Password Protected
 *
 * Menangani interaksi UI chat dan komunikasi dengan API backend.
 */

document.addEventListener('DOMContentLoaded', () => {
    // Elemen DOM
    const chatMessages = document.getElementById("chat-messages");
    const userInput = document.getElementById("user-input");
    const sendButton = document.getElementById("send-button");
    const typingIndicator = document.getElementById("typing-indicator");
    
    // Elemen Password
    const overlay = document.getElementById('password-overlay');
    const passInput = document.getElementById('app-pass');
    const loginBtn = document.getElementById('login-btn');
    const errorMsg = document.getElementById('pass-error');

    // Status Chat
    let chatHistory = [
        {
            role: "assistant",
            content: "Halo! Saya adalah aplikasi chat LLM yang didukung oleh Cloudflare Workers AI. Ada yang bisa saya bantu hari ini?",
        },
    ];
    let isProcessing = false;

    // --- LOGIKA PASSWORD ---
    loginBtn.onclick = () => {
        if (passInput.value === '19jutapekerjaan') {
            overlay.style.display = 'none';
            userInput.focus();
        } else {
            errorMsg.style.display = 'block';
            passInput.value = '';
        }
    };

    passInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") loginBtn.click();
    });

    // --- LOGIKA UI ---

    // Otomatis ubah ukuran textarea saat mengetik
    userInput.addEventListener("input", function () {
        this.style.height = "auto";
        this.style.height = this.scrollHeight + "px";
    });

    // Kirim pesan saat Enter (tanpa Shift)
    userInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    sendButton.addEventListener("click", sendMessage);

    /**
     * Mengirim pesan ke API chat dan memproses respons (Streaming)
     */
    async function sendMessage() {
        const message = userInput.value.trim();

        if (message === "" || isProcessing) return;

        // Nonaktifkan input selama memproses
        isProcessing = true;
        userInput.disabled = true;
        sendButton.disabled = true;

        // Tambah pesan user ke layar
        addMessageToChat("user", message);

        // Reset input
        userInput.value = "";
        userInput.style.height = "auto";

        // Tampilkan indikator mengetik
        typingIndicator.classList.add("visible");

        // Simpan ke riwayat
        chatHistory.push({ role: "user", content: message });

        try {
            // Buat elemen pesan assistant baru
            const assistantMessageEl = document.createElement("div");
            assistantMessageEl.className = "message assistant-message";
            chatMessages.appendChild(assistantMessageEl);

            // Scroll ke bawah
            chatMessages.scrollTop = chatMessages.scrollHeight;

            // Panggil API
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: chatHistory }),
            });

            if (!response.ok) throw new Error("Gagal mengambil respons");
            if (!response.body) throw new Error("Body respons kosong");

            // Proses respons streaming
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let responseText = "";
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const parsed = consumeSseEvents(buffer);
                buffer = parsed.buffer;

                for (const data of parsed.events) {
                    if (data === "[DONE]") break;
                    try {
                        const jsonData = JSON.parse(data);
                        let content = jsonData.response || jsonData.choices?.[0]?.delta?.content || "";
                        
                        if (content) {
                            responseText += content;
                            // Render Markdown ke HTML agar kode tampil rapi
                            assistantMessageEl.innerHTML = marked.parse(responseText);
                            
                            // Highlight kode jika ada blok kode baru
                            if (window.Prism) {
                                Prism.highlightAllUnder(assistantMessageEl);
                            }
                            
                            chatMessages.scrollTop = chatMessages.scrollHeight;
                        }
                    } catch (e) {
                        console.error("Gagal parse JSON:", e);
                    }
                }
            }

            if (responseText.length > 0) {
                chatHistory.push({ role: "assistant", content: responseText });
            }

        } catch (error) {
            console.error("Error:", error);
            addMessageToChat("assistant", "Maaf, terjadi kesalahan dalam memproses permintaan Anda.");
        } finally {
            typingIndicator.classList.remove("visible");
            isProcessing = false;
            userInput.disabled = false;
            sendButton.disabled = false;
            userInput.focus();
        }
    }

    /**
     * Fungsi pembantu untuk menambah pesan ke chat (Non-Streaming/Error)
     */
    function addMessageToChat(role, content) {
        const messageEl = document.createElement("div");
        messageEl.className = `message ${role}-message`;
        
        // Gunakan marked.parse jika dari assistant untuk mendukung kode
        messageEl.innerHTML = role === "assistant" ? marked.parse(content) : `<p>${content}</p>`;
        
        chatMessages.appendChild(messageEl);
        if (window.Prism) Prism.highlightAllUnder(messageEl);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    /**
     * Memproses Server-Sent Events (SSE)
     */
    function consumeSseEvents(buffer) {
        let normalized = buffer.replace(/\r/g, "");
        const events = [];
        let eventEndIndex;
        while ((eventEndIndex = normalized.indexOf("\n\n")) !== -1) {
            const rawEvent = normalized.slice(0, eventEndIndex);
            normalized = normalized.slice(eventEndIndex + 2);

            const lines = rawEvent.split("\n");
            const dataLines = [];
            for (const line of lines) {
                if (line.startsWith("data:")) {
                    dataLines.push(line.slice("data:".length).trimStart());
                }
            }
            if (dataLines.length === 0) continue;
            events.push(dataLines.join("\n"));
        }
        return { events, buffer: normalized };
    }
});
