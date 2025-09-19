let unionid = "MatesX01";
let rolesList = [];

function createRoleCard(role) {
    const card = document.createElement('div');
    card.className = 'gallery-item';

    // 图片容器
    const imgContainer = document.createElement('div');
    imgContainer.className = 'image-container';

    // 图片元素
    const img = document.createElement('img');
    img.className = 'character-image';
    img.src = role.avatar_url;

    // 将图片添加到容器
    imgContainer.appendChild(img);

    // 角色名称
    const nameDiv = document.createElement('div');
    nameDiv.className = 'character-name';
    nameDiv.textContent = role.avatar_name;

    // 将元素添加到卡片
    card.appendChild(imgContainer);
    card.appendChild(nameDiv);

    if (role.status !== 'pending') {
        card.addEventListener('click', () => {
            localStorage.setItem('selectedRoleID', role.avatar_id);
            window.location.href = 'characterPublic.html?avatar_mode=private';
        });
    }

    return card;
}

function renderRoleCards() {
    const gridGallery = document.querySelector('.grid-gallery');
    gridGallery.innerHTML = ''; // 清空现有内容

    // 生成角色卡片
    rolesList.forEach(role => {
        gridGallery.appendChild(createRoleCard(role));
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ unionid })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.message || '验证失败');

        localStorage.setItem('unionid', result.userInfo.unionid);
        localStorage.setItem('voices_list', JSON.stringify(result.userInfo.voices_list));
        localStorage.setItem('roles_list', JSON.stringify(result.userInfo.roles_list));
        localStorage.setItem('bg_list', JSON.stringify(result.userInfo.bg_list));
        rolesList = JSON.parse(localStorage.getItem('roles_list')) || [];
    } catch (error) {
        console.error('登录错误:', error.message);
    }

    // 初始化角色卡片
    renderRoleCards();

    document.querySelectorAll('.gallery-item').forEach(card => {
        card.addEventListener('mouseenter', () => {
            card.style.transform = 'translateY(-8px)';
            if(card.querySelector('.character-image')) {
                card.querySelector('.character-image').style.transform = 'scale(1.05)';
            }
        });
        card.addEventListener('mouseleave', () => {
            card.style.transform = 'none';
            if(card.querySelector('.character-image')) {
                card.querySelector('.character-image').style.transform = 'none';
            }
        });
    });

    document.querySelectorAll('.setting-item').forEach(item => {
        item.addEventListener('click', () => {
            item.style.background = '#F8F9FA';
            setTimeout(() => item.style.background = '', 200);
        });
    });
});

// 监听 localStorage 的变化
window.addEventListener('storage', (event) => {
    if (event.key === 'roles_list') {
        // 如果 roles_list 发生变化，立即调用 renderRoleCards
        console.log('roles_list 发生变化，重新渲染角色卡片');
        rolesList = JSON.parse(localStorage.getItem('roles_list')) || [];
        renderRoleCards();
    }
});
