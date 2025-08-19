import { fetchUserData, addFriend } from "./userdata.js";
import { openProfile } from "../profile.js";
const LChatContent = document.getElementById("live-chat-content");
const LmessageIn = document.getElementById("live-message-in");
const LsendButton = document.getElementById("live-send-button");
const friendChat = document.getElementById("friend-chat");
const chatContent = document.getElementById("chat-content");
const messageIn = document.getElementById("message-in");
const sendButton = document.getElementById("send-button");
const backButton = document.getElementById("back-button");
const userHeader = document.getElementById("user-header");
const friendsPane = document.getElementById("friends");
const searchBar = document.getElementById("search-bar");
const friendList = document.getElementById("friend-list");
const contextMenu = document.getElementById("context-menu");
const viewProfile = document.getElementById("view-profile");
const inviteUser = document.getElementById("invite-user");
let ws = null;
let currentUserData;
let selectedFriend = 0;
let userInfo = null;
let setIntervalId = null;
function connectChat() {
    if (ws) {
        console.warn("Chat: already connected");
        return;
    }
    const ui = localStorage.getItem("userInfo");
    if (!ui) {
        console.error("Chat: no userInfo in LS");
        return;
    }
    userInfo = JSON.parse(ui);
    if (!userInfo?.token) {
        userInfo = null;
        console.error("Chat: invalid token");
        return;
    }
    ws = new WebSocket(`wss://${window.location.host}/chat?token=${userInfo.token}`);
    initializeChat();
    ws.onopen = () => console.log("Chat WS: connected");
    ws.onerror = (e) => { console.error("Chat WS error:", e); disconnectChat(); };
    ws.onclose = (e) => {
        console.log("Chat WS closed", e.code, e.reason);
        if (e.code === 4000)
            console.log("No token provided");
        if (e.code === 4001)
            console.log("Invalid token");
    };
    ws.onmessage = (ev) => {
        const data = JSON.parse(ev.data);
        if (JSON.parse(currentUserData.blocked_users)
            .includes(data.sendId)) {
            return;
        }
        if (data.type === "public") {
            const m = document.createElement("div");
            m.textContent = data.message;
            if (data.sendId && data.sendId !== -1) {
                m.className = "view-profile cursor-pointer hover:underline hover:opacity-80";
                m.dataset.userid = String(data.sendId);
            }
            else {
                m.classList.add("pointer-events-none");
            }
            LChatContent.prepend(m);
            return;
        }
        const friendObj = currentUserData.friendlist.find(f => f.id === data.sendId);
        if (data.type === "private") {
            if (friendObj) {
                friendObj.chat_history?.push(data.message);
                if (selectedFriend === friendObj.id)
                    loadChatHistory(friendObj.id);
                else {
                    friendObj.new_message = true;
                    loadFriendList();
                }
            }
            else {
                const sys = currentUserData.friendlist.find(f => f.id === -1);
                sys.chat_history?.push(`${data.sendId}::${data.message}`);
                if (selectedFriend === -1)
                    loadSystemChat();
                else {
                    sys.new_message = true;
                    loadFriendList();
                }
            }
            return;
        }
        if (data.type === "error") {
            if (friendObj) {
                friendObj.chat_history?.push(data.message);
                if (selectedFriend === friendObj.id)
                    loadChatHistory(friendObj.id);
            }
            else {
                const m = document.createElement("div");
                m.textContent = data.message;
                LChatContent.prepend(m);
            }
            return;
        }
    };
}
function disconnectChat() {
    ws?.close();
    ws = null;
    userInfo = null;
    if (setIntervalId) {
        clearInterval(setIntervalId);
        setIntervalId = null;
    }
    console.log("Chat: disconnected");
}
async function initializeChat() {
    try {
        currentUserData = await fetchUserData(userInfo.id);
    }
    catch (e) {
        console.error("Chat: fetch user fail", e);
        return;
    }
    currentUserData.friendlist.forEach(f => (f.chat_history = []));
    currentUserData.friendlist.unshift({
        id: -1, username: "System", online: false,
        new_message: false, chat_history: []
    });
    friendChat.classList.add("hidden");
    backButton.classList.add("hidden");
    friendsPane.classList.remove("hidden");
    updateCurrentUserData();
    updateChatHeader();
    displayFriendsList();
}
document.onclick = () => { contextMenu.classList.add("hidden"); };
LsendButton.onclick = sendLive;
LmessageIn.onkeydown = (e) => { if (e.key === "Enter")
    sendLive(); };
function sendLive() {
    const msg = LmessageIn.value.trim();
    if (msg && ws)
        ws.send(JSON.stringify({ sendId: userInfo.id, message: msg, destId: 0 }));
    LmessageIn.value = "";
}
sendButton.onclick = sendPrivate;
messageIn.onkeydown = (e) => { if (e.key === "Enter")
    sendPrivate(); };
function sendPrivate() {
    const msg = messageIn.value.trim();
    if (msg && ws)
        ws.send(JSON.stringify({ sendId: userInfo.id, message: msg, destId: selectedFriend }));
    messageIn.value = "";
}
backButton.onclick = () => {
    friendChat.classList.add("hidden");
    backButton.classList.add("hidden");
    friendsPane.classList.remove("hidden");
    selectedFriend = 0;
    updateChatHeader();
    displayFriendsList();
};
function updateChatHeader(userId = 0) {
    if (!userId) {
        userHeader.textContent = "Friends";
        userHeader.classList.remove("view-profile", "cursor-pointer", "hover:underline", "hover:opacity-80", "pointer-events-none");
        delete userHeader.dataset.userid;
        userHeader.onclick = null;
        return;
    }
    if (userId === -1) {
        userHeader.textContent = "System";
        userHeader.classList.remove("view-profile", "cursor-pointer", "hover:underline", "hover:opacity-80");
        userHeader.classList.add("pointer-events-none");
        delete userHeader.dataset.userid;
        userHeader.onclick = null;
        return;
    }
    const name = currentUserData.friendlist.find(f => f.id === userId)?.username || "Unknown";
    userHeader.textContent = name;
    userHeader.classList.add("view-profile", "cursor-pointer", "hover:underline", "hover:opacity-80");
    userHeader.classList.remove("pointer-events-none");
    userHeader.dataset.userid = String(userId);
    userHeader.onclick = () => openProfile(userId);
}
function displayFriendsList() {
    searchBar.oninput = () => {
        const q = searchBar.value.trim();
        if (!q) {
            loadFriendList();
            return;
        }
        const matches = currentUserData.friendlist.filter(f => f.username.includes(q));
        matches.length ? loadFriendList(matches) : displayDummy(q);
    };
    loadFriendList();
}
function loadFriendList(list = currentUserData.friendlist) {
    friendList.innerHTML = "";
    list.forEach(friend => {
        if (friend.id === -1) {
            const sys = document.createElement("div");
            sys.textContent = "System";
            sys.onclick = () => openChat(-1);
            sys.className = rowBaseClass(friend.new_message);
            friendList.append(sys);
            return;
        }
        const row = document.createElement("div");
        row.className = rowBaseClass(friend.new_message) + " flex items-center gap-2";
        const name = document.createElement("span");
        name.textContent = friend.username;
        name.className = "view-profile cursor-pointer hover:underline hover:opacity-80";
        name.dataset.userid = String(friend.id);
        const dot = document.createElement("span");
        dot.className = friend.online
            ? "ml-auto w-3 h-3 border-2 border-slate-800 rounded-full bg-green-500"
            : "ml-auto w-2.5 h-2.5 border-2 border-slate-800 rounded-full bg-neutral-200";
        row.onclick = () => openChat(friend.id);
        row.oncontextmenu = (e) => rclickMenu(e, friend.id);
        row.append(name, dot);
        friendList.append(row);
    });
}
function rowBaseClass(bold) {
    return "w-full cursor-pointer relative p-2 border-b border-blue-900 hover:bg-amber-100 " +
        (bold ? "font-bold " : "");
}
function displayDummy(username) {
    friendList.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "w-full cursor-pointer p-2 border-b border-blue-900 hover:bg-amber-100 relative";
    wrap.textContent = username;
    const btn = document.createElement("button");
    btn.textContent = "Add Friend";
    btn.className = "p-1 bg-blue-900 text-amber-400 rounded absolute right-2 top-1/2 -translate-y-1/2";
    btn.onclick = () => sendFriendRequest(username);
    wrap.onclick = (ev) => {
        if (ev.target !== btn) {
            openSearchedProfile(username);
        }
    };
    wrap.append(btn);
    friendList.append(wrap);
}
async function openSearchedProfile(username) {
    try {
        const r = await fetch(`/search/${encodeURIComponent(username)}`, {
            headers: { Authorization: `Bearer ${userInfo.token}` }
        });
        if (!r.ok)
            throw new Error(r.statusText);
        const [u] = await r.json();
        if (!u) {
            alert("User not found.");
            return;
        }
        openProfile(u.id);
    }
    catch {
        alert("Failed to load profile.");
    }
}
function rclickMenu(e, userId) {
    e.preventDefault();
    contextMenu.classList.remove("hidden");
    contextMenu.style.left = `${e.offsetX}px`;
    contextMenu.style.top = `${e.offsetY + 150}px`;
    viewProfile.onclick = () => openProfile(userId);
    inviteUser.onclick = async () => {
        try {
            const r = await fetch("/invitetournament", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${userInfo.token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ id: userId })
            });
            if (!r.ok)
                throw new Error(r.statusText);
        }
        catch {
            alert("Failed to send game invite.");
        }
    };
}
function openChat(friendId) {
    friendsPane.classList.add("hidden");
    backButton.classList.remove("hidden");
    friendChat.classList.remove("hidden");
    selectedFriend = friendId;
    updateChatHeader(friendId);
    if (friendId === -1) {
        messageIn.classList.add("hidden");
        sendButton.classList.add("hidden");
        loadSystemChat();
    }
    else {
        messageIn.classList.remove("hidden");
        sendButton.classList.remove("hidden");
        loadChatHistory(friendId);
    }
}
function loadChatHistory(friendId) {
    chatContent.innerHTML = "";
    chatContent.className = "flex-1 flex flex-col-reverse overflow-y-auto min-h-0 box-border relative";
    const f = currentUserData.friendlist.find(fr => fr.id === friendId);
    f.new_message = false;
    f.chat_history?.forEach(msg => {
        const el = document.createElement("div");
        el.textContent = msg;
        chatContent.prepend(el);
    });
}
function loadSystemChat() {
    chatContent.innerHTML = "";
    chatContent.className = "flex-1 flex flex-col-reverse overflow-y-auto min-h-0 box-border relative";
    const sys = currentUserData.friendlist.find(f => f.id === -1);
    sys.new_message = false;
    sys.chat_history?.forEach(line => {
        const [senderId, msg] = line.split("::");
        const el = document.createElement("div");
        el.textContent = msg;
        if (senderId && senderId !== "-1") {
            el.className = "view-profile cursor-pointer hover:underline hover:opacity-80";
            el.dataset.userid = senderId;
        }
        else {
            el.classList.add("pointer-events-none");
        }
        chatContent.prepend(el);
    });
}
async function sendFriendRequest(username) {
    try {
        const r = await fetch(`/search/${encodeURIComponent(username)}`, {
            headers: { Authorization: `Bearer ${userInfo.token}` }
        });
        if (!r.ok)
            throw new Error(r.statusText);
        const [u] = await r.json();
        if (!u) {
            alert("User not found.");
            return;
        }
        await addFriend(u.id);
        currentUserData = await fetchUserData(userInfo.id);
        currentUserData.friendlist.unshift({
            id: -1, username: "System", online: false,
            new_message: false, chat_history: []
        });
        displayFriendsList();
    }
    catch {
        alert("Failed to send friend request.");
    }
}
function updateCurrentUserData() {
    setIntervalId = setInterval(async () => {
        if (!localStorage.getItem("userInfo"))
            return;
        try {
            const updated = await fetchUserData(userInfo.id);
            updated.friendlist.unshift({
                id: -1, username: "System", online: false,
                new_message: false, chat_history: []
            });
            updated.friendlist.forEach(f => {
                const prev = currentUserData.friendlist.find(p => p.id === f.id);
                if (prev) {
                    f.chat_history = prev.chat_history;
                    f.new_message = prev.new_message;
                }
            });
            currentUserData = updated;
            if (selectedFriend === 0)
                displayFriendsList();
        }
        catch (e) {
            console.error("update friends fail", e);
        }
    }, 30_000);
}
if (localStorage.getItem("userInfo")) {
    connectChat();
}
export { connectChat, disconnectChat };
