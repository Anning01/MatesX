// 角色数据
let rolesList = [];
let bgList = [];
let avatar_mode = "private";
characterVideo.addEventListener('loadedmetadata', () => {
                    console.log("loadedmetadata", characterVideo.videoWidth, characterVideo.videoHeight)
                    canvas_video.width = characterVideo.videoWidth;
                    canvas_video.height = characterVideo.videoHeight;
});

// 全局变量
let currentRole = null;
let currentBackground = null;

const selectorContainer = document.querySelector('.selector-container');
// 初始化页面
document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode');
    
    // 如果URL中有mode参数且值为public，则设置为public
    if (mode && mode.toLowerCase() === 'public') {
        avatar_mode = "public";
    }
    if (avatar_mode === "public")
    {
        rolesList = JSON.parse(localStorage.getItem('public_roles_list')) || [];
    }
    else {
        rolesList = JSON.parse(localStorage.getItem('roles_list')) || [];

        const settingsBtn = document.querySelector('.settings-btn');
        settingsBtn.onclick = function() {
            window.location.href = 'characterSetting.html';
        };
    }
    
    bgList = JSON.parse(localStorage.getItem('bg_list')) || [];
    bgList.push({
        bg_id: "blank_bg",
        bg_url: "",
        is_video: 2,
        thumbnail_url: "https://matesx.oss-cn-beijing.aliyuncs.com/public/bg_user_blank.jpg",
        unionid: ""
    });
    // 初始化选择器
    initSelector('character', rolesList);
    initSelector('background', bgList);

    // 添加下拉框交互
    setupSelectors();


    // 添加开始按钮事件
    document.getElementById('startMessage').addEventListener('click', async function() {
        if (selectorContainer.style.display === 'none') {
            selectorContainer.style.display = 'flex';
        }
        this.style.display = 'none';
        document.getElementById('screen2').style.display = 'block';

        const selectedRoleID = localStorage.getItem('selectedRoleID');
        if (!selectedRoleID) throw new Error('未找到角色ID');

        if (avatar_mode === "public")
        {
            rolesList = JSON.parse(localStorage.getItem('public_roles_list')) || [];
        }
        else {
            rolesList = JSON.parse(localStorage.getItem('roles_list')) || [];
        }

        const selectedRole = rolesList.find(role => role.avatar_id === selectedRoleID);
        if (!selectedRole) throw new Error('角色信息不存在，请重新选择');
        console.log("selectedRole: ", selectedRole)

        if (selectedRole) {


            let rolesList = JSON.parse(localStorage.getItem('roles_list')) || [];
            const selectedRoleID = localStorage.getItem('selectedRoleID');
            if (!selectedRoleID) throw new Error('未找到角色ID');
            let selectedRole = rolesList.find(role => role.avatar_id === selectedRoleID);

            // 加载角色记忆
            await window.memoryDataDB.init();
            let memoryData = await window.memoryDataDB.getMemoryDataByAvatarID(selectedRoleID);
            memoryData = memoryData.length > 0 ? memoryData[0] : null;

            if (selectedRole.memory_version > 0 &&
            (!memoryData || memoryData.memoryVersion !== selectedRole.memory_version))
            {
                const response = await fetch(selectedRole.memory_prompt_url);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const buffer = await response.arrayBuffer();
                memoryData = window.memoryDataDB.parseBinaryData(buffer);
                await window.memoryDataDB.saveMemoryData(memoryData);
            }
            if (memoryData)
            {
                window.embeddingManager.initialize(memoryData.memories);
                console.log("memoryData.memories.length: ", memoryData.memories.length)
            }

            //设置形象和背景
            playCharacterVideo(selectedRole.avatar_id);
            const selectedBg = bgList.find(bg => bg.bg_id === selectedRole.bg_id);
            if (selectedBg)
            {
                selectBackground(selectedBg);
            }
        }
    });
});

async function loadSecret(secret) {
    try {
        let jsonString = secret;
        // 分配内存
        // 使用 TextEncoder 计算 UTF-8 字节长度
        function getUTF8Length(str) {
            const encoder = new TextEncoder();
            const encoded = encoder.encode(str);
            return encoded.length + 1; // +1 是为了包含 null 终止符
        }
        let lengthBytes = getUTF8Length(jsonString);
        let stringPointer = Module._malloc(lengthBytes);
        Module.stringToUTF8(jsonString, stringPointer, lengthBytes);
        Module._processSecret(stringPointer);
        Module._free(stringPointer);
    } catch (error) {
        console.error('Error loadSecret:', error);
        throw error;
    }
}
async function fetchVideoUtilData(gzipUrl) {
        // 从服务器加载 Gzip 压缩的 JSON 文件
        const response = await fetch(gzipUrl);
        const compressedData = await response.arrayBuffer();
        const decompressedData = pako.inflate(new Uint8Array(compressedData), { to: 'string' });
//        const combinedData = JSON.parse(decompressedData);
        return decompressedData;
}
async function newVideoTask() {
    try {
        const selectedRoleID = localStorage.getItem('selectedRoleID');
        if (!selectedRoleID) throw new Error('未找到角色ID');
        // 获取unionid（假设用户登录后已存储）
        let unionid = localStorage.getItem('unionid');
        if (!unionid) throw new Error('用户未登录，请重新登录');

        if (avatar_mode === "public") {
            rolesList = JSON.parse(localStorage.getItem('public_roles_list')) || [];
        }
        else {
            rolesList = JSON.parse(localStorage.getItem('roles_list')) || [];
        }

        const selectedRole = rolesList.find(role => role.avatar_id === selectedRoleID);
        if (!selectedRole) throw new Error('角色信息不存在，请重新选择');
        console.log("selectedRole: ", selectedRole)

        const data_url = selectedRole.video_asset_url;
        let combinedData = await fetchVideoUtilData(data_url);
        await loadSecret(combinedData);
    } catch (error) {
        console.error('视频任务初始化失败:', error);
        alert(`操作失败: ${error.message}`);
    }
}

// 缓存已处理的视频URL
const videoURLCache = new Map();

// 播放角色视频
async function playCharacterVideo(avatar_id) {
    localStorage.setItem('selectedRoleID', avatar_id);

    if (avatar_mode === "public") {
        rolesList = JSON.parse(localStorage.getItem('public_roles_list')) || [];
    }
    else {
        rolesList = JSON.parse(localStorage.getItem('roles_list')) || [];
    }
    const selectedRole = rolesList.find(role => role.avatar_id === avatar_id);


    await newVideoTask();
    
    // 获取原始视频URL
    const originalVideoURL = selectedRole.video_url;
    let finalVideoURL = originalVideoURL;

    try {
        // 检查缓存中是否有处理过的URL
        if (!videoURLCache.has(originalVideoURL)) {
            // 获取视频数据并创建同源URL
            const response = await fetch(originalVideoURL, {
                mode: 'cors',
                credentials: 'omit'
            });

            if (!response.ok) throw new Error('视频获取失败');

            // 将响应转为Blob
            const blob = await response.blob();
            // 创建同源对象URL
            const blobURL = URL.createObjectURL(blob);

            // 缓存结果
            videoURLCache.set(originalVideoURL, blobURL);
        }

        // 使用缓存的同源URL
        finalVideoURL = videoURLCache.get(originalVideoURL);
    } catch (error) {
        console.warn('视频中转失败，使用原始URL:', error);
        // 失败时添加时间戳绕过缓存
        finalVideoURL = originalVideoURL + '?ts=' + Date.now();
    }
    // 设置视频源（使用同源URL或带时间戳的原始URL）
    characterVideo.src = finalVideoURL;
    characterVideo.loop = true;
    characterVideo.muted = true;
    characterVideo.playsInline = true;

    characterVideo.load();
    console.log("characterVideo.load finished.");
    try {
        await characterVideo.play();
    } catch (e) {
        console.error('视频播放失败:', e);
    }
}


// 选择背景
function selectBackground(bg) {
    console.log("bg: ", bg)
    document.getElementById('startMessage').style.display = 'none';
    currentBackground = bg;

    // 更新选中的背景显示
    document.getElementById('selected-bg-thumb').src = bg.thumbnail_url;
    const bgVideo = document.getElementById('background-video');
    const bgImage = document.getElementById('background-image');
    if (bg.is_video > 1) {
        // 透明背景
        bgVideo.src = "";
        bgImage.src = "";
        bgVideo.style.display = 'none';
        bgImage.style.display = 'none';
    }
    else if (bg.is_video == 1) {
        bgVideo.src = bg.bg_url;
        bgVideo.style.display = 'block';
        bgImage.style.display = 'none';
        bgVideo.play().catch(e => {
            console.error('背景视频播放失败:', e);
        });
    } else {
        // 图片背景
        bgImage.src = bg.bg_url;
        bgImage.style.display = 'block';
        bgVideo.style.display = 'none';
    }
}



// 初始化选择器
function initSelector(type, items) {
    const dropdown = document.getElementById(`${type}-dropdown`);

    if ((type === "background") && 
        (/iPad|iPhone|iPod/.test(navigator.userAgent) || 
        (navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome')))) {
        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.padding = '10px';
        container.style.margin = '5px 0';
        container.style.backgroundColor = '#fff3cd';
        container.style.borderRadius = '4px';
        container.style.borderLeft = '4px solid #ffc107';
        
        const message = document.createElement('div');
        message.style.color = '#856404';
        message.style.fontSize = '14px';
        message.textContent = 'iOS不支持切换背景';
        
        container.appendChild(message);
        dropdown.appendChild(container);
        return;
    }

    items.forEach(item => {
        const option = document.createElement('div');
        option.className = 'dropdown-option';
        option.dataset.id = type === 'character' ? item.avatar_id : item.bg_id;

        const img = document.createElement('img');
        img.src = type === 'character' ? item.avatar_url : item.thumbnail_url;
        img.alt = type === 'character' ? item.avatar_name : '背景';

        option.appendChild(img);
        option.addEventListener('click', function(e) {
            if (type === 'character') {
                e.stopPropagation();
            }
            if (type === 'character') {
                selectRole(item);
            } else {
                selectBackground(item);
            }
        });

        dropdown.appendChild(option);
    });
}
// 设置选择器交互
function setupSelectors() {
    const selects = document.querySelectorAll('.custom-select');

    selects.forEach(select => {
        select.addEventListener('click', function(e) {
            e.stopPropagation();
            // 关闭其他下拉框
            document.querySelectorAll('.custom-select').forEach(s => {
                if (s !== this) s.classList.remove('active');
            });
            this.classList.toggle('active');
        });
    });

    // 点击页面其他区域关闭下拉框
    document.addEventListener('click', function() {
        selects.forEach(select => {
            select.classList.remove('active');
        });
    });
}

// 选择角色
function selectRole(role) {
    document.getElementById('startMessage').style.display = 'none';
    currentRole = role;

    // 更新选中的角色显示
    document.getElementById('selected-character-thumb').src = role.avatar_url;
    document.getElementById('character-select').classList.remove('active');            // 播放角色视频
    playCharacterVideo(role.avatar_id);
}


