import { type User, type Friend, fetchUserData, addFriend } from "./userdata.js";
import { openProfile }                     from "../profile.js";

/* ---------- DOM ----------------------------------------------------- */
const LChatContent = document.getElementById("live-chat-content")  as HTMLElement;
const LmessageIn   = document.getElementById("live-message-in")    as HTMLInputElement;
const LsendButton  = document.getElementById("live-send-button")   as HTMLButtonElement;

const friendChat   = document.getElementById("friend-chat")        as HTMLElement;
const chatContent  = document.getElementById("chat-content")       as HTMLElement;
const messageIn    = document.getElementById("message-in")         as HTMLInputElement;
const sendButton   = document.getElementById("send-button")        as HTMLButtonElement;

const backButton   = document.getElementById("back-button")        as HTMLButtonElement;
const userHeader   = document.getElementById("user-header")        as HTMLElement;
const friendsPane  = document.getElementById("friends")            as HTMLElement;
const searchBar    = document.getElementById("search-bar")         as HTMLInputElement;
const friendList   = document.getElementById("friend-list")        as HTMLElement;

const contextMenu  = document.getElementById("context-menu")       as HTMLElement;
const viewProfile  = document.getElementById("view-profile")       as HTMLElement;
const inviteUser   = document.getElementById("invite-user")        as HTMLElement;

/* ---------- Types & state ------------------------------------------ */
interface UserInfo {
  id:       number;
  token:    string;
  username: string;
  avatar:   string | null;
}

let ws: WebSocket | null          = null;
let currentUserData: User;            // full DB object for me
let selectedFriend: number = 0;       // 0 = friend-list, -1 = “System”
let userInfo: UserInfo | null  = null;
let setIntervalId: ReturnType<typeof setInterval> | null = null;

/* ====================================================================
 *  Connection bootstrap
 * ================================================================== */
function connectChat(): void {
  if (ws) { console.warn("Chat: already connected"); return; }

  const ui = localStorage.getItem("userInfo");
  if (!ui) { console.error("Chat: no userInfo in LS"); return; }

  userInfo = JSON.parse(ui);
  if (!userInfo?.token) { userInfo = null; console.error("Chat: invalid token"); return; }

  ws = new WebSocket(`wss://${window.location.host}/chat?token=${userInfo.token}`);
  initializeChat();

  ws.onopen    = () => console.log("Chat WS: connected");
  ws.onerror   = (e) => { console.error("Chat WS error:", e); disconnectChat(); };
  ws.onclose   = (e) => {
    console.log("Chat WS closed", e.code, e.reason);
    if (e.code === 4000) console.log("No token provided");
    if (e.code === 4001) console.log("Invalid token");
  };

  /* =================================================================
   *  Incoming messages
   * =============================================================== */
  ws.onmessage = (ev) => {
    const data = JSON.parse(ev.data);

    /* blocklist */
    if (JSON.parse(currentUserData.blocked_users)
          .includes(data.sendId)) { return; }

    /* --------------- PUBLIC -------------------------------------- */
    if (data.type === "public") {
      const m = document.createElement("div");
      m.textContent = data.message;

      /* make sender’s name clickable if provided */
      if (data.sendId && data.sendId !== -1) {
        m.className = "view-profile cursor-pointer hover:underline hover:opacity-80";
        m.dataset.userid = String(data.sendId);
      } else {
        m.classList.add("pointer-events-none");
      }
      LChatContent.prepend(m);
      return;
    }

    /* --------------- PRIVATE / SYSTEM / ERROR -------------------- */
    const friendObj =
      currentUserData.friendlist.find(f => f.id === data.sendId);

    if (data.type === "private") {
      if (friendObj) {
        friendObj.chat_history?.push(data.message);
        if (selectedFriend === friendObj.id) loadChatHistory(friendObj.id);
        else { friendObj.new_message = true; loadFriendList(); }
      } else {
        const sys = currentUserData.friendlist.find(f => f.id === -1);
        sys.chat_history?.push(`${data.sendId}::${data.message}`);
        if (selectedFriend === -1) loadSystemChat(); else { sys.new_message = true; loadFriendList(); }
      }
      return;
    }

    if (data.type === "error") {
      if (friendObj) {
        friendObj.chat_history?.push(data.message);
        if (selectedFriend === friendObj.id) loadChatHistory(friendObj.id);
      } else {
        const m = document.createElement("div");
        m.textContent = data.message;
        LChatContent.prepend(m);
      }
      return;
    }
  };
}

function disconnectChat(): void {
  ws?.close();
  ws = null;
  userInfo = null;
  if (setIntervalId) { clearInterval(setIntervalId); setIntervalId = null; }
  console.log("Chat: disconnected");
}

/* ====================================================================
 *  Initial data fetch & UI boot
 * ================================================================== */
async function initializeChat(): Promise<void> {
  try {
    currentUserData = await fetchUserData(userInfo.id);
  } catch (e) { console.error("Chat: fetch user fail", e); return; }

  /* add “System” pseudo-friend at top of list */
  currentUserData.friendlist.forEach(f => (f.chat_history = []));
  currentUserData.friendlist.unshift({
    id: -1, username: "System", online: false,
    new_message: false, chat_history: []
  } as Friend);

  friendChat.classList.add("hidden");
  backButton.classList.add("hidden");
  friendsPane.classList.remove("hidden");

  updateCurrentUserData();
  updateChatHeader();
  displayFriendsList();
}

/* ====================================================================
 *  Global click → close context-menu
 * ================================================================== */
document.onclick = () => { contextMenu.classList.add("hidden"); };

/* ====================================================================
 *  Send buttons / keypress
 * ================================================================== */
LsendButton.onclick = sendLive;
LmessageIn.onkeydown = (e) => { if (e.key === "Enter") sendLive(); };
function sendLive() {
  const msg = LmessageIn.value.trim();
  if (msg && ws) ws.send(JSON.stringify({ sendId: userInfo.id, message: msg, destId: 0 }));
  LmessageIn.value = "";
}

sendButton.onclick = sendPrivate;
messageIn.onkeydown = (e) => { if (e.key === "Enter") sendPrivate(); };
function sendPrivate() {
  const msg = messageIn.value.trim();
  if (msg && ws)
    ws.send(JSON.stringify({ sendId: userInfo.id, message: msg, destId: selectedFriend }));
  messageIn.value = "";
}

/* ====================================================================
 *  Navigation: back to friends
 * ================================================================== */
backButton.onclick = () => {
  friendChat.classList.add("hidden");
  backButton.classList.add("hidden");
  friendsPane.classList.remove("hidden");

  selectedFriend = 0;
  updateChatHeader();
  displayFriendsList();
};

/* ====================================================================
 *  Chat header (shows “Friends” or username)
 * ================================================================== */
function updateChatHeader(userId: number = 0) {
  if (!userId) {                       // friends-list mode
    userHeader.textContent = "Friends";
    userHeader.classList.remove(
      "view-profile",
      "cursor-pointer",
      "hover:underline",
      "hover:opacity-80",
      "pointer-events-none"
    );
    delete userHeader.dataset.userid;
    userHeader.onclick = null;
    return;
  }

  if (userId === -1) {                 // system
    userHeader.textContent = "System";
    userHeader.classList.remove(
      "view-profile",
      "cursor-pointer",
      "hover:underline",
      "hover:opacity-80"
    );
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

/* ====================================================================
 *  Friends pane
 * ================================================================== */
function displayFriendsList() {
  searchBar.oninput = () => {
    const q = searchBar.value.trim();
    if (!q) { loadFriendList(); return; }

    const matches = currentUserData.friendlist.filter(f => f.username.includes(q));
    matches.length ? loadFriendList(matches) : displayDummy(q);
  };
  loadFriendList();
}

function loadFriendList(list: Friend[] = currentUserData.friendlist) {
  friendList.innerHTML = "";

  list.forEach(friend => {
    /* -------- system row ------------------------------------------ */
    if (friend.id === -1) {
      const sys = document.createElement("div");
      sys.textContent   = "System";
      sys.onclick       = () => openChat(-1);
      sys.className     = rowBaseClass(friend.new_message);
      friendList.append(sys);
      return;
    }

    /* -------- normal friend row ----------------------------------- */
    const row  = document.createElement("div");
    row.className = rowBaseClass(friend.new_message) + " flex items-center gap-2";

    /* name span → opens profile modal */
    const name = document.createElement("span");
    name.textContent = friend.username;
    name.className   = "view-profile cursor-pointer hover:underline hover:opacity-80";
    name.dataset.userid = String(friend.id);

    /* online status dot */
    const dot = document.createElement("span");
    dot.className = friend.online
      ? "ml-auto w-3 h-3 border-2 border-slate-800 rounded-full bg-green-500"
      : "ml-auto w-2.5 h-2.5 border-2 border-slate-800 rounded-full bg-neutral-200";

    /* whole row (except name) opens DM */
    row.onclick      = () => openChat(friend.id);
    row.oncontextmenu = (e) => rclickMenu(e, friend.id);

    row.append(name, dot);
    friendList.append(row);
  });
}
function rowBaseClass(bold: boolean) {
  return "w-full cursor-pointer relative p-2 border-b border-blue-900 hover:bg-amber-100 " +
         (bold ? "font-bold " : "");
}

/* when search finds nobody ------------------------------ */
function displayDummy(username: string) {
  friendList.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "w-full cursor-pointer p-2 border-b border-blue-900 hover:bg-amber-100 relative";

  wrap.textContent = username;

  const btn = document.createElement("button");
  btn.textContent = "Add Friend";
  btn.className   = "p-1 bg-blue-900 text-amber-400 rounded absolute right-2 top-1/2 -translate-y-1/2";
  btn.onclick     = () => sendFriendRequest(username);

  // open profile when clicking anywhere on the row (except the button)
  wrap.onclick = (ev) => {
    if (ev.target !== btn) {
      openSearchedProfile(username);
    }
  };

  wrap.append(btn);
  friendList.append(wrap);
}

async function openSearchedProfile(username: string) {
  try {
    const r = await fetch(`/search/${encodeURIComponent(username)}`, {
      headers: { Authorization: `Bearer ${userInfo.token}` }
    });
    if (!r.ok) throw new Error(r.statusText);
    const [u] = await r.json();
    if (!u) { alert("User not found."); return; }
    openProfile(u.id);
  } catch {
    alert("Failed to load profile.");
  }
}

/* ====================================================================
 *  Right-click context-menu
 * ================================================================== */
function rclickMenu(e: MouseEvent, userId: number) {
  e.preventDefault();
  contextMenu.classList.remove("hidden");
  contextMenu.style.left = `${e.offsetX}px`;
  contextMenu.style.top  = `${e.offsetY + 150}px`;

  viewProfile.onclick = () => openProfile(userId);

  inviteUser.onclick = async () => {
    try {
      const r = await fetch("/invitetournament", {
        method : "POST",
        headers: {
          Authorization: `Bearer ${userInfo.token}`,
          "Content-Type": "application/json"
        },
        body   : JSON.stringify({ id: userId })
      });
      if (!r.ok) throw new Error(r.statusText);
    } catch { alert("Failed to send game invite."); }
  };
}

/* ====================================================================
 *  Open a DM or System chat
 * ================================================================== */
function openChat(friendId: number) {
  friendsPane.classList.add("hidden");
  backButton.classList.remove("hidden");
  friendChat.classList.remove("hidden");

  selectedFriend = friendId;
  updateChatHeader(friendId);

  if (friendId === -1) {          // system
    messageIn.classList.add("hidden");
    sendButton.classList.add("hidden");
    loadSystemChat();
  } else {
    messageIn.classList.remove("hidden");
    sendButton.classList.remove("hidden");
    loadChatHistory(friendId);
  }
}

/* ====================================================================
 *  Load chat histories
 * ================================================================== */
function loadChatHistory(friendId: number) {
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
    } else {
      el.classList.add("pointer-events-none");
    }
    chatContent.prepend(el);
  });
}

/* ====================================================================
 *  Friend request helper
 * ================================================================== */
async function sendFriendRequest(username: string) {
  try {
    const r = await fetch(`/search/${encodeURIComponent(username)}`, {
      headers: { Authorization: `Bearer ${userInfo.token}` }
    });
    if (!r.ok) throw new Error(r.statusText);
    const [u] = await r.json();
    if (!u) { alert("User not found."); return; }
    await addFriend(u.id);
    // refresh list immediately
    currentUserData = await fetchUserData(userInfo.id);
    currentUserData.friendlist.unshift({
      id: -1, username: "System", online: false,
      new_message: false, chat_history: []
    } as Friend);
    displayFriendsList();
  } catch { alert("Failed to send friend request."); }
}

/* ====================================================================
 *  Polling for friend status updates
 * ================================================================== */
function updateCurrentUserData(): void {
  setIntervalId = setInterval(async () => {
    if (!localStorage.getItem("userInfo")) return;
    try {
      const updated = await fetchUserData(userInfo.id);
      updated.friendlist.unshift({
        id: -1, username: "System", online: false,
        new_message: false, chat_history: []
      } as Friend);

      /* keep chat histories & new_message flags */
      updated.friendlist.forEach(f => {
        const prev = currentUserData.friendlist.find(p => p.id === f.id);
        if (prev) {
          f.chat_history = prev.chat_history;
          f.new_message  = prev.new_message;
        }
      });
      currentUserData = updated;
      if (selectedFriend === 0) displayFriendsList();
    } catch (e) { console.error("update friends fail", e); }
  }, 30_000);
}

/* ====================================================================
 *  Boot if user already logged-in
 * ================================================================== */
if (localStorage.getItem("userInfo")) { connectChat(); }

export { connectChat, disconnectChat };