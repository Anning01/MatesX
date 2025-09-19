// role-edit.js
document.addEventListener('DOMContentLoaded', async function() {
    {
        // 原有的JavaScript逻辑保持不变
        let rolesList;
        rolesList = JSON.parse(localStorage.getItem('roles_list')) || [];

        // 同步页面数据
        window.addEventListener('storage', (event) => {
            if (event.key === 'roles_list') {
                rolesList = JSON.parse(localStorage.getItem('roles_list')) || [];
                console.log('角色列表已更新:', rolesList);
            }
        });

        const selectedRoleID = localStorage.getItem('selectedRoleID');
        if (!selectedRoleID) throw new Error('未找到角色ID');

        const unionid = localStorage.getItem('unionid');
        if (!unionid) throw new Error('用户未登录，请重新登录');

        let selectedRole = rolesList.find(role => role.avatar_id === selectedRoleID);
        if (!selectedRole) throw new Error('角色信息不存在，请重新选择');
        console.log("selectedRole: ", selectedRole);

        const { avatar_name, avatar_url, system_prompt, avatar_id, cosyvoice_id, chat_count, memory_prompt_url, memory_version } = selectedRole;

        // 设置角色名称
        document.getElementById('name-input').value = selectedRole.avatar_name || '';

        // 设置人物设定
        const textarea = document.getElementById('character-desc');
        textarea.value = selectedRole.system_prompt || '';
        // 设置头像
        const avatarDisplay = document.getElementById('avatar-display');
        if (avatar_url) {
            avatarDisplay.innerHTML = `<img src="${avatar_url}" alt="${avatar_name}">`;
        }

        // 设置当前选中的声音信息
        const voices_list = JSON.parse(localStorage.getItem('voices_list')) || [];
        const currentVoice = voices_list.find(voice => voice.cosyvoice_id === selectedRole.cosyvoice_id);
        const selectedVoiceName = document.getElementById('selected-voice-name');
        const selectedVoiceId = document.getElementById('selected-voice-id');

        if (currentVoice) {
            selectedVoiceName.textContent = currentVoice.voice_name;
            selectedVoiceId.textContent = `ID: ${currentVoice.cosyvoice_id}`;
        }

        // 生成语音选项
        const voiceOptions = document.getElementById('voice-options');

        voices_list.forEach(voice => {
            const isSelected = voice.cosyvoice_id === selectedRole.cosyvoice_id;

            const option = document.createElement('div');
            option.className = `voice-option ${isSelected ? 'selected' : ''}`;
            option.dataset.voiceId = voice.cosyvoice_id;

            option.innerHTML = `
                <div class="voice-option-info">
                    <div class="voice-option-name">${voice.voice_name}</div>
                    <div class="voice-option-id">ID: ${voice.cosyvoice_id}</div>
                </div>
                <div class="voice-option-action">
                    <button class="preview-btn" data-voice-id="${voice.cosyvoice_id}">
                        <i class="material-icons">play_arrow</i>
                        试听
                    </button>
                </div>
            `;

            voiceOptions.appendChild(option);
        });

        // 下拉框交互逻辑
        const voiceSelectTrigger = document.getElementById('voice-select-trigger');
        const dropdownArrow = voiceSelectTrigger.querySelector('.dropdown-arrow');

        voiceSelectTrigger.addEventListener('click', function() {
            voiceOptions.classList.toggle('open');
            dropdownArrow.classList.toggle('open');
            voiceSelectTrigger.classList.toggle('open');
        });

        // 选择语音选项
        voiceOptions.addEventListener('click', function(e) {
            const option = e.target.closest('.voice-option');
            if (!option) return;

            const voiceId = option.dataset.voiceId;
            const voice = voices_list.find(v => v.cosyvoice_id === voiceId);

            if (voice) {
                // 更新选中状态
                document.querySelectorAll('.voice-option').forEach(opt => {
                    opt.classList.remove('selected');
                });
                option.classList.add('selected');

                // 更新显示
                selectedVoiceName.textContent = voice.voice_name;
                selectedVoiceId.textContent = `ID: ${voice.cosyvoice_id}`;

                // 更新角色数据
                selectedRole.cosyvoice_id = voice.cosyvoice_id;

                // 关闭下拉框
                voiceOptions.classList.remove('open');
                dropdownArrow.classList.remove('open');
                voiceSelectTrigger.classList.remove('open');
            }
        });

        // 试听功能
        voiceOptions.addEventListener('click', function(e) {
            if (e.target.closest('.preview-btn')) {
                e.stopPropagation();

                const button = e.target.closest('.preview-btn');
                const voiceId = button.dataset.voiceId;
                const voice = voices_list.find(v => v.cosyvoice_id === voiceId);

                if (!voice || !voice.clone_voice_url) {
                    alert('未找到可试听的语音样本');
                    return;
                }

                const originalHtml = button.innerHTML;
                button.innerHTML = '<i class="material-icons">volume_up</i> 试听中...';
                button.disabled = true;

                // 创建音频对象并播放
                const audio = new Audio(voice.clone_voice_url);

                audio.addEventListener('canplaythrough', function() {
                    audio.play().catch(error => {
                        console.error('播放失败:', error);
                        button.innerHTML = originalHtml;
                        button.disabled = false;
                        alert('语音播放失败，请检查网络连接');
                    });
                });

                audio.addEventListener('ended', function() {
                    button.innerHTML = '<i class="material-icons">play_arrow</i> 试听';
                    button.disabled = false;
                });

                audio.addEventListener('error', function() {
                    button.innerHTML = originalHtml;
                    button.disabled = false;
                    alert('语音加载失败，请检查音频文件地址');
                });
            }
        });

        // 点击页面其他区域关闭下拉框
        document.addEventListener('click', function(e) {
            if (!voiceSelectTrigger.contains(e.target) && !voiceOptions.contains(e.target)) {
                voiceOptions.classList.remove('open');
                dropdownArrow.classList.remove('open');
                voiceSelectTrigger.classList.remove('open');
            }
        });

        const counter = document.getElementById('word-counter');

        textarea.addEventListener('input', function() {
            const currentLength = this.value.length;
            counter.textContent = `${currentLength}/500`;

            if (currentLength > 500) {
                counter.classList.add('warning');
            } else {
                counter.classList.remove('warning');
            }
        });

        // 初始化计数
        textarea.dispatchEvent(new Event('input'));

        // 添加修改按钮的点击事件
        document.getElementById('update-btn').addEventListener('click', async function() {
            // 获取输入框中的内容
            const newName = document.getElementById('name-input').value;
            const newSystemPrompt = document.getElementById('character-desc').value;

            selectedRole = rolesList.find(role => role.avatar_id === selectedRoleID);

            // 更新角色信息
            selectedRole.avatar_name = newName;
            selectedRole.system_prompt = newSystemPrompt;
            rolesList = JSON.parse(localStorage.getItem('roles_list')) || [];

            // 更新 localStorage 中的 roles_list
            const updatedRolesList = rolesList.map(role => {
                if (role.avatar_id === selectedRoleID) {
                    return selectedRole;
                }
                return role;
            });

            localStorage.setItem('roles_list', JSON.stringify(updatedRolesList));

            try {
                // 向服务器发送请求
                const response = await fetch('https://www.matesx.com/api/auth/update_role', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        avatar_id: selectedRoleID,
                        unionid: unionid,
                        avatar_name: newName,
                        cosyvoice_id: selectedRole.cosyvoice_id || '',
                        system_prompt: newSystemPrompt
                    })
                });

                const result = await response.json();

                if (result.code === 0) {
                    alert('角色信息已更新');
                } else {
                    alert('角色信息更新失败，请稍后重试');
                }
            } catch (error) {
                console.error('请求失败:', error);
                alert('网络错误，请检查网络连接');
            }
        });

        await window.memoryDataDB.init();
        let memoryData = await window.memoryDataDB.getMemoryDataByAvatarID(selectedRoleID);
        memoryData = memoryData.length > 0 ? memoryData[0] : null;
        // 更新统计数据
        document.getElementById('intimacy-level').textContent = `Lv.${selectedRole.chat_count}`;
        document.getElementById('chat-count').textContent = selectedRole.chat_count;

        // 假设 selectedRole 是你已有的对象
        const updatedTime = new Date(selectedRole.updated_time);
        const createdTime = new Date(selectedRole.created_time);
        const now = new Date();
        const diffTime = Math.abs(now - updatedTime);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        const createdDateStr = createdTime.toISOString().split('T')[0]; // 获取 "2025-09-17"
        document.getElementById('last-active').textContent = `${diffDays}天前`;
        document.getElementById('created-days').textContent = createdDateStr;

        // 渲染记忆列表
        const memoryList = document.getElementById('memory-list');
        const memoryEmpty = document.getElementById('memory-empty');

        function renderMemories() {
            if (memoryData && memoryData.memories.length > 0) {
                memoryEmpty.style.display = 'none';
                memoryList.innerHTML = '';

                // 取前20条记忆
                const memoriesToRender = memoryData.memories.slice(0, 20);

                memoriesToRender.forEach((memory, index) => {
                    console.log("GGGGGGGG", memory, index)
                    const memoryItem = document.createElement('div');
                    memoryItem.className = 'memory-item';
                    memoryItem.innerHTML = `
                        <div class="memory-text">${memory.text}</div>
                        <div class="memory-actions">
                            <button class="memory-action-btn edit-memory" data-index="${index}">
                                <i class="material-icons">edit</i>
                            </button>
                            <button class="memory-action-btn delete-memory" data-index="${index}">
                                <i class="material-icons">delete</i>
                            </button>
                        </div>
                    `;
                    memoryList.appendChild(memoryItem);
                });
            } else {
                memoryEmpty.style.display = 'block';
            }
        }

        renderMemories();

        // 记忆操作
        let currentEditIndex = -1;

        // 编辑记忆
        memoryList.addEventListener('click', function(e) {
            if (e.target.closest('.edit-memory')) {
                const index = e.target.closest('.edit-memory').dataset.index;
                document.getElementById('modal-title').textContent = '编辑记忆';
                document.getElementById('memory-input').value = memoryData.memories[index];
                document.getElementById('edit-memory-modal').style.display = 'flex';
                currentEditIndex = index;
            }

            if (e.target.closest('.delete-memory')) {
                const index = e.target.closest('.delete-memory').dataset.index;
                if (confirm('确定要删除这条记忆吗？')) {
                    memoryData.memories.splice(index, 1);
                    renderMemories();
                }
            }
        });

        // 模态框操作
        document.getElementById('modal-close').addEventListener('click', function() {
            document.getElementById('edit-memory-modal').style.display = 'none';
        });

        document.getElementById('modal-cancel').addEventListener('click', function() {
            document.getElementById('edit-memory-modal').style.display = 'none';
        });

        document.getElementById('modal-save').addEventListener('click', function() {
            const memoryText = document.getElementById('memory-input').value.trim();
            if (memoryText) {
                if (currentEditIndex >= 0) {
                    // 编辑现有记忆
                    memoryData.memories[currentEditIndex] = memoryText;
                } else {
                    // 添加新记忆
                    if (memoryData.memories.length >= 10) {
                        alert('最多只能添加10条记忆');
                        return;
                    }
                    memoryData.memories.push(memoryText);
                }
                renderMemories();
                document.getElementById('edit-memory-modal').style.display = 'none';
            } else {
                alert('请输入记忆内容');
            }
        });
    }
});