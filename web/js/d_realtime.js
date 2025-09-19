const unionid = localStorage.getItem('unionid') || "";
let rolesList = JSON.parse(localStorage.getItem('roles_list')) || [];
let public_roles_list = JSON.parse(localStorage.getItem('public_roles_list')) || [];
           
let voiceDisturbEnabled = localStorage.getItem('voiceDisturbEnabled') === 'true';
if (localStorage.getItem('voiceDisturbEnabled') === null) {
    voiceDisturbEnabled = true; // 默认开启
}

let chatHistoryShowed = localStorage.getItem('chatHistoryShowed') === 'true';
if (localStorage.getItem('chatHistoryShowed') === null) {
    chatHistoryShowed = true; // 默认开启
    const chatContainer_ = document.getElementById('chat-container');
    chatContainer_.classList.toggle('hidden');
}

window.addEventListener('storage', (event) => {
    if (event.key === 'chatHistoryShowed') {
        chatHistoryShowed = event.newValue === 'true';
        const chatContainer_ = document.getElementById('chat-container');
        chatContainer_.classList.toggle('hidden');
    }
    else if (event.key === 'voiceDisturbEnabled') {
        voiceDisturbEnabled = event.newValue === 'true';
    }
});

// 同步页面数据
window.addEventListener('storage', (event) => {
    if (event.key === 'roles_list') {
        rolesList = JSON.parse(localStorage.getItem('roles_list')) || [];
        console.log('角色列表已更新:', rolesList);
    }
    if (event.key === 'public_roles_list') {
        public_roles_list = JSON.parse(localStorage.getItem('public_roles_list')) || [];
        console.log('公共角色列表已更新:', rolesList);
    }
});

let server_url = "/chat_stream"
let auth_url = "/generate_temp_token"
let isVoiceMode = true;                 // 默认使用语音模式
let asrWorker = null;
let cosyvoice = null;

// 录音阶段
let asr_audio_recorder = new PCMAudioRecorder();
let isRecording = false;                  // 标记当前录音是否向ws传输
let asr_input_text = "";                  // 从ws接收到的ASR识别后的文本
let last_voice_time = null;               // 上一次检测到人声的时间
let last_3_voice_samples = [];
const VAD_SILENCE_DURATION = 800;         // 800ms不说话判定为讲话结束

let isAsrReady = false;                   // 标记ASR是否准备就绪
const pendingAudioData = [];              // 新增：缓存等待发送的语音数据

// SSE 阶段（申请流式传输LLM+TTS的阶段）
let sse_startpoint = true;                // SSE传输开始标志
let sse_endpoint = false;                 // SSE传输结束标志
let sse_controller = null;                // SSE网络中断控制器，可用于打断传输
let sse_data_buffer = "";                 // SSE网络传输数据缓存区，用于存储不完整的 JSON 块

// 播放音频阶段
let player = null;


const toggleButton = document.getElementById('toggle-button');
const inputArea = document.getElementById('input-area');
const chatContainer = document.getElementById('chat-container');
const sendButton = document.getElementById('send-button');
const textInput = document.getElementById('text-input');
const voiceInputArea = document.getElementById('voice-input-area');
const voiceInputText = voiceInputArea.querySelector('span');

document.addEventListener('DOMContentLoaded', function() {
  if (!window.isSecureContext) {
    alert('本项目使用了 WebCodecs API，该 API 仅在安全上下文（HTTPS 或 localhost）中可用。因此，在部署或测试时，请确保您的网页在 HTTPS 环境下运行，或者使用 localhost 进行本地测试。');
  }
});

// 初始设置为语音模式
function setVoiceMode() {
    isVoiceMode = true;
    toggleButton.innerHTML = '<i class="material-icons">keyboard</i>';
    textInput.style.display = 'none';
    sendButton.style.display = 'none';
    voiceInputArea.style.display = 'flex';
    voiceInputText.textContent = '点击开始聊天'; // 恢复文字
    user_abort();
}

// 初始设置为文字模式
function setTextMode() {
    isVoiceMode = false;
    toggleButton.innerHTML = '<i class="material-icons">mic</i>';
    textInput.style.display = 'block';
    sendButton.style.display = 'block';
    voiceInputArea.style.display = 'none';
    user_abort();
    if (!asr_audio_recorder || !asr_audio_recorder.audioContext)
    {
        asr_audio_recorder.stop();
    }
}

// 切换输入模式
toggleButton.addEventListener('click', () => {
    console.log("toggleButton", isVoiceMode)
    if (isVoiceMode) {
        setTextMode();
    } else {
        setVoiceMode();
    }
});

// 存储临时token及其获取时间
let tempTokenCache = {
    model: null,
    token: null,
    timestamp: null
};

async function getTempToken(model_name, voice_id) {
    const unionid = localStorage.getItem('unionid');
    if (!unionid)
    {
        alert('用户未登录');
        return;
    }
    // 检查缓存中是否有有效的token（40秒内）
    const now = Date.now();
    if (tempTokenCache.token && tempTokenCache.timestamp &&
        (now - tempTokenCache.timestamp) < 40000 && tempTokenCache.model == model_name) {
        return tempTokenCache.token;
    }
    try {
        const response = await fetch(auth_url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ unionid, model_name, voice_id }),
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();

        // 更新缓存
        tempTokenCache = {
            model: model_name,
            token: data.token,
            timestamp: now
        };

        return data.token;
    } catch (error) {
        console.error('获取临时token失败:', error);
        alert('无法获取语音服务凭证，请稍后重试');
        throw error;
    }
}

// 创建Web Worker
asrWorker = new Worker('js/worker_asr.js');

// 处理来自Worker的消息
asrWorker.onmessage = function(event) {
    const data = event.data;
    console.log("asrWorker.onmessage", data, data.type)
    if (data.type === 'status') {
        if (data.message === "识别任务已完成")
        {

            if (asr_input_text) {
                user_abort();
                addMessage(asr_input_text, true, true);
                sendTextMessage(asr_input_text);
            }
        }
        else if (data.message === "已连接到ASR服务器") {
            isAsrReady = true;
            
            // 发送所有缓存数据
            while (pendingAudioData.length > 0) {
                const data = pendingAudioData.shift();
                asrWorker.postMessage(
                    { type: 'audio', data: data },
                    [data.buffer]  // 转移所有权
                );
            }
        }
    } 
    else if (data.type === 'partial_result') {
        asr_input_text = data.text;
    } 
    else if (data.type === 'final_result') {
        asr_input_text = data.text;
    } 
    else if (data.type === 'error') {
        console.error('ASR Worker Error:', data.message);
    }
};



async function running_audio_recorder() {
    if (!asr_audio_recorder || !asr_audio_recorder.audioContext) {
        if (asr_audio_recorder.isConnecting) {
            return;
        }
        await asr_audio_recorder.connect(async (pcmData) => {
            const pcmCopy = new Int16Array(pcmData);
            last_3_voice_samples.push(pcmCopy);
            if (last_3_voice_samples.length > 3) {
                last_3_voice_samples = last_3_voice_samples.slice(-3);
            }

            // PCM数据处理,只取前 512 个 int16 数据
            const uint8Data = new Uint8Array(pcmData.buffer, 0, 512 * 2);
            const arrayBufferPtr = parent.Module._malloc(uint8Data.byteLength);
            parent.Module.HEAPU8.set(uint8Data, arrayBufferPtr);

            // VAD检测,speech_score(0-1)代表检测到人声的置信度
            const speech_score = parent.Module._getAudioVad(arrayBufferPtr, uint8Data.byteLength);
            parent.Module._free(arrayBufferPtr); // 确保内存释放
            let current_time = Date.now();

            if (speech_score > 0.5 && last_3_voice_samples.length > 1) {
                if (!isRecording) {
                    isRecording = true;
                    isAsrReady = false; // 重置准备状态
                    pendingAudioData.length = 0; // 清空缓存

                    // 1. 先缓存历史语音
                    if (last_3_voice_samples.length >= 2) {
                        pendingAudioData.push(last_3_voice_samples[0]);
                        pendingAudioData.push(last_3_voice_samples[1]);
                    }

                    asrWorker.postMessage({ type: 'start', unionid: unionid });
                }
                if (isAsrReady) {
                    asrWorker.postMessage(
                        { type: 'audio', data: pcmData },
                        [pcmData.buffer] // 转移所有权
                    );
                }
                else {
                    pendingAudioData.push(pcmCopy);
                }
                last_voice_time = current_time;
            }
            else {
                if (isRecording) {
                    if (last_voice_time && (current_time - last_voice_time) > VAD_SILENCE_DURATION && isAsrReady) {
                        isRecording = false;
                        last_voice_time = null;
                        console.log("Voice activity ended");
                        asrWorker.postMessage({ type: 'stop' });
                        if (!voiceDisturbEnabled)
                        {
                            await asr_audio_recorder.stop();
                        }
                    } else {
                        asrWorker.postMessage({
                            type: 'audio',
                            data: pcmData
                        }, [pcmData.buffer]); // 转移ArrayBuffer所有权
                    }
                }
            }
        });
    }
}

async function start_new_round() {
    if (! player)
    {
        player = new PCMAudioPlayer(16000);

    }
    player.connect();
    player.stop();
    // 停止可能存在的旧轮次
    asrWorker.postMessage({ type: 'stop' });

    // 重置状态
    isRecording = false;

    asr_input_text = "";
    last_voice_time = null;


    // TTS部分保持不变
    if (cosyvoice && cosyvoice.socket) {
        await cosyvoice.close();
    }


    if (isVoiceMode) {
        console.log("start_new_round")
        await running_audio_recorder();
    }
}

// 语音输入逻辑
voiceInputArea.addEventListener('click', async (event) => {
    event.preventDefault(); // 阻止默认行为
    console.log("voiceInputArea click")
    await user_abort();
    voiceInputText.textContent = '点击重新开始对话'; // 恢复文字
    await start_new_round();
});

// 提取的共同处理函数
async function handleUserMessage() {
    const icon = sendButton.querySelector('i.material-icons');
    
    // 检查停止状态
    if (icon && icon.textContent.trim() === 'stop') {
        user_abort();
        return false; // 表示未发送消息
    }
    
    const inputValue = textInput.value.trim();
    if (inputValue) {
        await start_new_round();
        addMessage(inputValue, true, true);
        sendTextMessage(inputValue);
        return true; // 表示已发送消息
    }
    return false; // 表示未发送消息
}

// 修改后的事件监听器
sendButton.addEventListener('click', async (event) => {
    await handleUserMessage();
});

textInput.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
        const shouldPreventDefault = await handleUserMessage();
        if (shouldPreventDefault) {
            e.preventDefault(); // 仅在发送消息时阻止默认换行行为
        }
    }
});

// 添加消息到聊天记录
function addMessage(message, isUser, isNew, replace=false) {
    if (isNew) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message');
        messageElement.classList.add(isUser ? 'user' : 'ai');
        messageElement.innerHTML = `
            <div class="message-content">${message}</div>
        `;
        chatContainer.appendChild(messageElement);
    } else {
        // 直接操作 innerHTML 或使用 append 方法
        const lastMessageContent = chatContainer.lastElementChild.querySelector('.message-content');
        if (replace)
        {
            lastMessageContent.innerHTML = message;
        }
        else
        {
            lastMessageContent.innerHTML += message;
        }
    }
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// 初始设置为语音模式
setVoiceMode();

async function handleResponseStream(responseBody, signal) {
    const reader = responseBody.getReader();
    const decoder = new TextDecoder();

    try {
        while (true) {
            if (signal.aborted) {
                reader.cancel(); // 主动取消流读取
                break;
            }
            const { done, value } = await reader.read();
            if (done) {
                return;
            }
            const chunk = decoder.decode(value, { stream: true });
            sse_data_buffer += chunk; // 将新数据追加到缓存区

            // 根据换行符拆分缓存区中的数据
            const chunks = sse_data_buffer.split("\n");
            for (let i = 0; i < chunks.length - 1; i++) {
                try {
                    const data = JSON.parse(chunks[i]);
                    // console.log("Received data:", data);
                    console.log("Received text:", data.text, sse_startpoint, data.endpoint);
                    // 返回直接是一个空字符并结束，就模拟消息“嗯，让我想一想”
                    if (!data.text && sse_startpoint && data.endpoint)
                    {
                        data.text = "嗯。";
                        data.endpoint = false;
                    }
                    addMessage(data.text, false, sse_startpoint);
                    cosyvoice.sendText(data.text);
                    sse_startpoint = false;
                    sse_endpoint = data.endpoint;
                    if (sse_endpoint)
                    {
                        console.log('cosyvoice stopped');
                        await cosyvoice.stop();
                    }
                } catch (error) {
                    console.error("Error parsing chunk:", error);
                }
                // 将最后一个不完整的块保留在缓存区中
                sse_data_buffer = chunks[chunks.length - 1];
            }
        }
    } catch (error) {
        console.error('流处理异常:', error);
    }
}

async function tts_realtime_ws(voice_id, model_name) {
    try {
        const token = await getTempToken(model_name, voice_id);
        cosyvoice = new Cosyvoice(`wss://dashscope.aliyuncs.com/api-ws/v1/inference/?api_key=${token}`, voice_id, "cosyvoice-v1");

        await cosyvoice.connect((pcmData) => {
            player.pushPCM(pcmData);
        });

        console.log('cosyvoice connected');
    } catch (error) {
        console.error('语音服务连接失败:', error);
        alert('语音服务连接失败，请检查网络后重试');
    }
}

// 发送文字消息
async function sendTextMessage(inputValue) {
    console.log("sendTextMessage", inputValue)
    const unionid = localStorage.getItem('unionid');
    if (!unionid)
    {
        alert('用户未登录');
        return;
    }
    const selectedRoleID = localStorage.getItem('selectedRoleID');
    if (!sendTextMessage)
    {
        alert('未找到角色');
        return;
    }
    // const selectedRole = rolesList.find(role => role.avatar_id === selectedRoleID);
    const selectedRole = [...rolesList, ...public_roles_list].find(role => role.avatar_id === selectedRoleID);
    console.log("selectedRole voice_id: ", selectedRole.cosyvoice_id);

    const similarMemoryTextList = [];
    if (window.parent.embeddingManager.memories)
    {
        const token = await getTempToken("", "");
        const queryEmbedding = await window.parent.embeddingManager.getEmbedding(inputValue, token);
        const similarMemoryTextList = window.parent.embeddingManager.searchSimilarMemories(queryEmbedding, 5, 0.0);
        console.log("similarMemoryTextList:", similarMemoryTextList);
    }

    let requestBody = {
        input_mode: "text",
        prompt: inputValue,
        memory_prompt: similarMemoryTextList,
        unionid: unionid,
        avatar_id: selectedRoleID,
    };

    let voice_id = selectedRole.cosyvoice_id;
    let tts_model = "ali";
    
    sendButton.innerHTML = '<i class="material-icons">stop</i>';
    if (inputValue) {
        try {
            player.connect()
            player.stop()

            if (sse_controller)
            {
                console.log("sse_controller.abort();");
                sse_controller.abort();
            }

            await tts_realtime_ws(voice_id, tts_model);
            sse_controller = new AbortController();
            sse_startpoint = true;
            sse_endpoint = false;
            textInput.value = "";
            const response = await fetch(server_url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal: sse_controller.signal
            });

            if (!response.ok) throw new Error(`HTTP错误 ${response.status}`);
            await handleResponseStream(response.body, sse_controller.signal);
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('请求中止');
            } else {
                console.error('请求错误:', error);
            }
            await start_new_round();
        }
    }
    else
    {
        await start_new_round();
    }
}

// 用户中断操作
async function user_abort() {
    console.log("user_abort")
    // 停止ASR轮次
    asrWorker.postMessage({ type: 'stop' });

    if (isVoiceMode) {
        if (!voiceDisturbEnabled)
        {
            if (!asr_audio_recorder || !asr_audio_recorder.audioContext) {
                asr_audio_recorder.stop();
            }
        }
    }

    if (sse_controller)
    {
        console.log("sse_controller.abort();");
        sse_controller.abort();
    }
    if (player)
    {
        player.stop();
        player.finished = true;
        parent.Module._clearAudio();
    }
    sendButton.innerHTML = '<i class="material-icons">send</i>'; // 发送图标
}

class PCMAudioPlayer {
    constructor(sampleRate) {
        this.sampleRate = sampleRate;
        this.audioContext = null;
        this.audioQueue = [];
        this.isPlaying = false;
        this.currentSource = null;
        const bufferThreshold = 2;
        this.finished = true;
    }

    connect() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        console.log("connect audioContext", this.audioContext.state);
        this.finished = false;
    }

    pushPCM(arrayBuffer) {
        this.audioQueue.push(arrayBuffer);
        this._playNextAudio();
    }

    /**
     * 将arrayBuffer转为audioBuffer
     */
    _bufferPCMData(pcmData) {
        const sampleRate = this.sampleRate; // 设置为 PCM 数据的采样率
        const length = pcmData.byteLength / 2; // 假设 PCM 数据为 16 位，需除以 2
        const audioBuffer = this.audioContext.createBuffer(1, length, sampleRate);
        const channelData = audioBuffer.getChannelData(0);
        const int16Array = new Int16Array(pcmData); // 将 PCM 数据转换为 Int16Array

        for (let i = 0; i < length; i++) {
            // 将 16 位 PCM 转换为浮点数 (-1.0 到 1.0)
            channelData[i] = int16Array[i] / 32768; // 16 位数据转换范围
        }
        let audioLength = length/sampleRate*1000;
        // console.log(`prepare audio: ${length} samples, ${audioLength} ms`)

        return audioBuffer;
    }

    async _playAudio(arrayBuffer) {
        if (this.finished)
        {
            return;
        }

        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        const view = new Uint8Array(arrayBuffer);
        const arrayBufferPtr = parent.Module._malloc(arrayBuffer.byteLength);
        parent.Module.HEAPU8.set(view, arrayBufferPtr);
        // console.log("buffer.byteLength", arrayBuffer.byteLength);
        parent.Module._setAudioBuffer(arrayBufferPtr, arrayBuffer.byteLength);
        parent.Module._free(arrayBufferPtr);


        const audioBuffer = this._bufferPCMData(arrayBuffer);

        this.currentSource = this.audioContext.createBufferSource();
        this.currentSource.buffer = audioBuffer;
        this.currentSource.connect(this.audioContext.destination);

        this.currentSource.onended = () => {
            // console.log('Audio playback ended.');
            this.isPlaying = false;
            this.currentSource = null;
            this._playNextAudio(); // Play the next audio in the queue
        };
        this.currentSource.start();
        this.isPlaying = true;
    }

    async _playNextAudio() {
        if (this.audioQueue.length > 0 && !this.isPlaying) {
            // 计算总的字节长度
            const totalLength = this.audioQueue.reduce((acc, buffer) => acc + buffer.byteLength, 0);
            const combinedBuffer = new Uint8Array(totalLength);
            let offset = 0;

            // 将所有 audioQueue 中的 buffer 拼接到一个新的 Uint8Array 中
            for (const buffer of this.audioQueue) {
                combinedBuffer.set(new Uint8Array(buffer), offset);
                offset += buffer.byteLength;
            }

            // 清空 audioQueue，因为我们已经拼接完所有数据
            this.audioQueue = [];
            // 发送拼接的 audio 数据给 playAudio
            this._playAudio(combinedBuffer.buffer);
        }
        else {
            // this.finished标志本轮已提前结束（被手动打断或新一轮语音接管），不要再改变已有状态了
            if (sse_endpoint && cosyvoice.isTaskFinished && !this.finished) {
                sendButton.innerHTML = '<i class="material-icons">send</i>'; // 发送图标
                console.log("_playAudio Done!!!!")
                await start_new_round();
            }
        }
    }
    stop() {
        if (this.currentSource) {
            this.currentSource.stop(); // 停止当前音频播放
            this.currentSource = null; // 清除音频源引用
            this.isPlaying = false; // 更新播放状态
        }

        this.audioQueue = []; // 清空音频队列
        console.log('Playback stopped and queue cleared.');
    }
}

