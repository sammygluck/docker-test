const chat = document.getElementById('chat-block');
const hideBtn = document.getElementById('chat-hide');
const toggleBtn = document.getElementById('chat-toggle');
function showChat() {
    if (!chat || !toggleBtn)
        return;
    chat.classList.remove('translate-y-full');
    chat.classList.add('md:translate-y-0');
    toggleBtn.classList.add('hidden');
}
function hideChat() {
    if (!chat || !toggleBtn)
        return;
    chat.classList.add('translate-y-full');
    chat.classList.remove('md:translate-y-0');
    if (localStorage.getItem('userInfo')) {
        toggleBtn.classList.remove('hidden');
    }
    else {
        toggleBtn.classList.add('hidden');
    }
}
function toggleChat() {
    if (!chat)
        return;
    if (chat.classList.contains('translate-y-full')) {
        showChat();
    }
    else {
        hideChat();
    }
}
hideChat();
hideBtn?.addEventListener('click', toggleChat);
toggleBtn?.addEventListener('click', showChat);
window.addEventListener('resize', () => {
    if (window.innerWidth < 768 && chat && !chat.classList.contains('translate-y-full')) {
        hideChat();
    }
});
