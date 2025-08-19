let __CURRENT_USER_ID = null;
window.__CURRENT_USER_ID = null;
let _navProfileInitDone = false;
export function getAvatarUrl(avatar, version) {
    if (!avatar)
        return null;
    const base = avatar.startsWith("http") ? avatar : `/uploads/${avatar}`;
    return version ? `${base}?v=${version}` : base;
}
export async function openProfile(userId) {
    const tpl = document.getElementById("profile-tpl");
    if (!tpl)
        throw new Error("#profile-tpl template element not found");
    const frag = tpl.content.cloneNode(true);
    const overlay = frag.firstElementChild;
    document.body.appendChild(overlay);
    overlay.querySelector(".close-btn")?.addEventListener("click", () => overlay.remove());
    const token = localStorage.getItem("token");
    if (!token) {
        alert("Missing auth token – please login again");
        overlay.remove();
        return;
    }
    let data;
    try {
        const res = await fetch(`/user/${userId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        data = (await res.json());
        if (!res.ok)
            throw new Error(data.error ?? "Cannot load profile");
    }
    catch (err) {
        alert(err instanceof Error ? err.message : String(err));
        overlay.remove();
        return;
    }
    if (userId === window.__CURRENT_USER_ID) {
        const buf = localStorage.getItem("userInfo");
        if (buf) {
            try {
                const ui = JSON.parse(buf);
                ui.username = data.username;
                ui.avatar = data.avatar ?? null;
                ui.updated_at = data.updated_at ?? null;
                localStorage.setItem("userInfo", JSON.stringify(ui));
            }
            catch {
            }
        }
    }
    renderView(overlay, data);
    wireExtraButtons(overlay, data);
    wireFriendBlock(overlay, data);
    if (userId === window.__CURRENT_USER_ID) {
        const navAvatar = document.getElementById("navAvatar");
        if (navAvatar)
            navAvatar.src = data.avatar
                ? getAvatarUrl(data.avatar, data.updated_at)
                : "/assets/default-avatar.png";
        const nameEl = document.getElementById("navUsername");
        if (nameEl) {
            nameEl.textContent = data.username;
        }
        const tf = wireTwoFactor(overlay, data);
        wireEdit(overlay, data, tf);
    }
}
function renderView(ov, d) {
    const usernameVal = (d.username ?? "").trim();
    ov.querySelector("#pr-handle").textContent = `@${usernameVal}`;
    ov.querySelector("#pr-username").textContent = usernameVal;
    const fullVal = (d.full_name ?? "").trim() || usernameVal;
    ov.querySelector("#pr-full").textContent = fullVal;
    ov.querySelector("#pr-email").textContent = d.email ?? "";
    const created = d.created_at ? new Date(d.created_at).toLocaleDateString() : "";
    ov.querySelector("#pr-created").textContent = created;
    const onlineDot = ov.querySelector("#pr-online");
    onlineDot.classList.remove("bg-red-500", "bg-green-500");
    onlineDot.classList.add(d.online ? "bg-green-500" : "bg-red-500");
    const img = ov.querySelector("#pr-avatar");
    img.src = d.avatar
        ? getAvatarUrl(d.avatar, d.updated_at)
        : "/assets/default-avatar.png";
    ov.querySelectorAll(".private").forEach(el => {
        const val = el.querySelector("span")?.textContent?.trim();
        if (!val)
            el.classList.add("hidden");
    });
}
function wireEdit(ov, data, tfHooks) {
    const edit = ov.querySelector("#pr-edit");
    const save = ov.querySelector("#pr-save");
    const cancel = ov.querySelector("#pr-cancel");
    const show = (btn) => {
        btn.classList.remove("hidden");
        btn.classList.add("inline-block");
    };
    const hide = (btn) => {
        btn.classList.add("hidden");
        btn.classList.remove("inline-block");
    };
    show(edit);
    hide(save);
    hide(cancel);
    edit.onclick = () => {
        hide(edit);
        show(save);
        show(cancel);
        tfHooks?.enable();
        ["username", "full"].forEach(k => {
            const span = ov.querySelector(`#pr-${k}`);
            const val = span.textContent ?? "";
            const input = document.createElement("input");
            input.id = `pr-${k}-in`;
            input.value = val;
            input.className = "w-full p-1 border border-pink-500 rounded bg-[#1e1e3f] text-pink-100";
            span.replaceChildren(input);
        });
        ["#pr-email", "#pr-created", "#pr-online"].forEach(sel => {
            ov.querySelector(sel)?.classList.add("opacity-50");
        });
        ov.querySelector("#pr-avatar")?.insertAdjacentHTML("afterend", `<label for=\"pr-avatar-in\" class=\"block my-2\">\n          <span class=\"px-3 py-1 rounded-md bg-emerald-500 text-white font-semibold hover:bg-emerald-600 cursor-pointer\">Upload</span>\n          <input id=\"pr-avatar-in\" type=\"file\" accept=\"image/*\" class=\"hidden\" />\n        </label>\n        <span id=\"pr-avatar-name\" class=\"block text-sm text-pink-100\"></span>`);
        const imgIn = ov.querySelector("#pr-avatar-in");
        const nameOut = ov.querySelector("#pr-avatar-name");
        imgIn?.addEventListener("change", () => {
            const file = imgIn.files?.[0];
            if (nameOut)
                nameOut.textContent = file ? file.name : "";
        });
    };
    cancel.onclick = () => {
        tfHooks?.disable();
        ov.remove();
        void openProfile(data.id);
    };
    save.onclick = async () => {
        const body = {
            username: (ov.querySelector("#pr-username-in")?.value ?? "").trim(),
            full_name: (ov.querySelector("#pr-full-in")?.value ?? "").trim()
        };
        const token = localStorage.getItem("token");
        if (!token) {
            alert("Auth expired");
            return;
        }
        const up = await fetch("/profile", {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(body)
        });
        let updated = null;
        try {
            updated = (await up.json());
        }
        catch {
        }
        if (!up.ok) {
            if (up.status === 409) {
                alert(updated?.error ?? "Conflict");
            }
            else {
                alert(updated?.error ?? "Save failed");
            }
            return;
        }
        const confirmedUsername = typeof updated?.username === "string" ? updated.username : null;
        const confirmedFullName = typeof updated?.full_name === "string" ? updated.full_name : null;
        if (!confirmedUsername) {
            alert("Unexpected server response");
        }
        else {
            const buf = localStorage.getItem("userInfo");
            if (buf) {
                try {
                    const ui = JSON.parse(buf);
                    ui.username = confirmedUsername;
                    ui.full_name = confirmedFullName;
                    localStorage.setItem("userInfo", JSON.stringify(ui));
                }
                catch {
                }
            }
            const nameEl = document.getElementById("navUsername");
            if (nameEl)
                nameEl.textContent = confirmedUsername;
        }
        const imgInput = ov.querySelector("#pr-avatar-in");
        if (imgInput?.files?.length) {
            const fd = new FormData();
            fd.append("file", imgInput.files[0]);
            await fetch("/avatar", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: fd
            });
        }
        ov.remove();
        void openProfile(data.id);
    };
}
function wireTwoFactor(ov, data) {
    const row = ov.querySelector("#pr-2fa-row");
    const box = ov.querySelector("#pr-2fa");
    if (data.google_sign_in) {
        row.classList.add("hidden");
        return { enable: () => { }, disable: () => { } };
    }
    row.classList.remove("hidden");
    box.checked = !!data.two_factor_auth;
    const handler = async () => {
        const token = localStorage.getItem("token");
        if (!token)
            return;
        const res = await fetch("/twofactor", {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ enabled: box.checked })
        });
        if (!res.ok) {
            alert("Failed to update setting");
            box.checked = !box.checked;
        }
    };
    const enable = () => {
        box.disabled = false;
        box.addEventListener("change", handler);
    };
    const disable = () => {
        box.disabled = true;
        box.removeEventListener("change", handler);
    };
    disable();
    return { enable, disable };
}
function wireExtraButtons(ov, data) {
    const friendsBtn = ov.querySelector("#pr-friends");
    const histBtn = ov.querySelector("#pr-history");
    const extraBox = ov.querySelector("#pr-extra");
    const token = localStorage.getItem("token");
    let currentView = null;
    friendsBtn.onclick = async () => {
        extraBox.classList.remove("overflow-x-hidden");
        if (currentView === "friends") {
            extraBox.replaceChildren();
            currentView = null;
            return;
        }
        currentView = "friends";
        extraBox.innerHTML = "<p>Loading…</p>";
        let rows = [];
        try {
            const r = await fetch(`/friends/${data.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            rows = (await r.json());
        }
        catch {
        }
        if (!Array.isArray(rows) || !rows.length) {
            extraBox.textContent = "No friends to show.";
            return;
        }
        const ul = document.createElement("ul");
        rows.forEach(u => {
            const li = document.createElement("li");
            const nameSpan = document.createElement("span");
            nameSpan.textContent = u.username;
            nameSpan.dataset.userid = String(u.id);
            nameSpan.className =
                "view-profile cursor-pointer text-[color:var(--link,#06c)] hover:underline hover:opacity-80";
            li.appendChild(nameSpan);
            ul.appendChild(li);
        });
        extraBox.replaceChildren(ul);
    };
    histBtn.onclick = async () => {
        if (currentView === "history") {
            extraBox.classList.remove("overflow-x-hidden");
            extraBox.replaceChildren();
            currentView = null;
            return;
        }
        currentView = "history";
        extraBox.innerHTML = "<p>Loading…</p>";
        let games = [];
        try {
            const r = await fetch(`/matchhistory/${data.id}?limit=100`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            games = (await r.json());
        }
        catch {
        }
        if (!Array.isArray(games) || !games.length) {
            extraBox.textContent = "No matches yet.";
            return;
        }
        const tbl = document.createElement("table");
        tbl.className = "w-full table-auto";
        const includeTournament = games.length && ("tournament_name" in games[0] || "tournamentId" in games[0]);
        tbl.innerHTML =
            `<thead class="text-left"><tr>` +
                `<th class="px-2">Date</th>` +
                `<th class="px-2">Opponent</th>` +
                `<th class="px-2">Result</th>` +
                `<th class="px-2">Score</th>` +
                (includeTournament ? `<th class="px-2">Tournament</th>` : "") +
                `</tr></thead>`;
        const tb = document.createElement("tbody");
        games.forEach(g => {
            const row = document.createElement("tr");
            const youWon = g.winnerId === data.id;
            const opponentName = youWon ? g.loser_username : g.winner_username;
            const opponentId = youWon ? g.loserId : g.winnerId;
            let tournament = "";
            if (includeTournament)
                tournament = g.tournament_name ?? String(g.tournamentId ?? "");
            const tdDate = document.createElement("td");
            tdDate.className = "px-2 whitespace-nowrap";
            const date = new Date(g.timestamp);
            tdDate.textContent = date.toLocaleString();
            row.appendChild(tdDate);
            const tdOpponent = document.createElement("td");
            tdOpponent.className = "px-2";
            const nameSpan = document.createElement("span");
            nameSpan.textContent = opponentName ?? "";
            nameSpan.dataset.userid = String(opponentId);
            nameSpan.className =
                "view-profile cursor-pointer text-[color:var(--link,#06c)] hover:underline hover:opacity-80";
            tdOpponent.appendChild(nameSpan);
            row.appendChild(tdOpponent);
            const tdResult = document.createElement("td");
            tdResult.className = `px-2 ${youWon ? "text-green-500" : "text-red-500"}`;
            tdResult.textContent = youWon ? "Win" : "Loss";
            row.appendChild(tdResult);
            const tdScore = document.createElement("td");
            tdScore.className = "px-2";
            const yourScore = youWon ? g.scoreWinner : g.scoreLoser;
            const oppScore = youWon ? g.scoreLoser : g.scoreWinner;
            tdScore.textContent = `${yourScore} – ${oppScore}`;
            row.appendChild(tdScore);
            if (includeTournament) {
                const tdTournament = document.createElement("td");
                tdTournament.className = "px-2";
                tdTournament.textContent = tournament;
                row.appendChild(tdTournament);
            }
            tb.appendChild(row);
        });
        tbl.appendChild(tb);
        extraBox.classList.add("overflow-x-hidden");
        extraBox.replaceChildren(tbl);
    };
}
function wireFriendBlock(ov, data) {
    const friendBtn = ov.querySelector("#pr-friend-action");
    const blockBtn = ov.querySelector("#pr-block-action");
    const token = localStorage.getItem("token");
    friendBtn.classList.add("hidden");
    blockBtn.classList.add("hidden");
    if (data.id === window.__CURRENT_USER_ID)
        return;
    (async () => {
        const r = await fetch("/currentuser", { headers: { Authorization: `Bearer ${token}` } });
        const me = (await r.json());
        const friends = me.friends ? JSON.parse(me.friends).map(Number) : [];
        const blocked = me.blocked_users ? JSON.parse(me.blocked_users).map(Number) : [];
        const updateFriendLabel = () => {
            friendBtn.textContent = friends.includes(data.id) ? "Remove Friend" : "Add Friend";
        };
        const updateBlockLabel = () => {
            blockBtn.textContent = blocked.includes(data.id) ? "Unblock User" : "Block User";
        };
        updateFriendLabel();
        updateBlockLabel();
        friendBtn.classList.remove("hidden");
        blockBtn.classList.remove("hidden");
        friendBtn.onclick = async () => {
            const isFriend = friends.includes(data.id);
            const method = isFriend ? "DELETE" : "POST";
            const res = await fetch("/friend", {
                method,
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ friendId: data.id })
            });
            if (!res.ok)
                return;
            if (isFriend) {
                friends.splice(friends.indexOf(data.id), 1);
            }
            else {
                friends.push(data.id);
            }
            updateFriendLabel();
        };
        blockBtn.onclick = async () => {
            const isBlocked = blocked.includes(data.id);
            const method = isBlocked ? "DELETE" : "POST";
            const res = await fetch("/block", {
                method,
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ userId: data.id })
            });
            if (!res.ok)
                return;
            if (isBlocked) {
                blocked.splice(blocked.indexOf(data.id), 1);
            }
            else {
                blocked.push(data.id);
            }
            updateBlockLabel();
        };
    })();
}
export function initNavProfile() {
    let userInfoGlobal;
    const buf = localStorage.getItem("userInfo");
    if (!buf) {
        document.getElementById("chat-block")?.classList.add("hidden");
        if (window.location.pathname !== "/login") {
            window.location.href = "/login";
        }
        return;
    }
    userInfoGlobal = JSON.parse(buf);
    const avatarEl = document.getElementById("navAvatar");
    if (avatarEl) {
        avatarEl.dataset.userid = String(userInfoGlobal.id);
        avatarEl.classList.add("view-profile", "cursor-pointer", "hover:underline", "hover:opacity-80");
    }
    (async () => {
        const userInfo = userInfoGlobal;
        localStorage.setItem("token", userInfo.token);
        const me = await fetch("/currentuser", {
            headers: { Authorization: `Bearer ${userInfo.token}` }
        }).then(r => r.json()).catch(() => null);
        if (!me) {
            window.location.href = "/login";
            return;
        }
        __CURRENT_USER_ID = window.__CURRENT_USER_ID = me.id;
        userInfo.username = me.username;
        userInfo.avatar = me.avatar ?? null;
        userInfo.updated_at = me.updated_at ?? null;
        localStorage.setItem("userInfo", JSON.stringify(userInfo));
        const avatar = document.getElementById("navAvatar");
        if (avatar) {
            avatar.dataset.userid = String(me.id);
            avatar.src = me.avatar ? getAvatarUrl(me.avatar, me.updated_at) : "/assets/default-avatar.png";
        }
        const nameEl = document.getElementById("navUsername");
        if (nameEl) {
            const usernameVal = (me.username ?? "").trim();
            nameEl.textContent = usernameVal;
            nameEl.dataset.userid = String(me.id);
            nameEl.classList.add("view-profile", "cursor-pointer", "hover:underline", "hover:opacity-80");
        }
    })();
    if (!_navProfileInitDone) {
        document.body.addEventListener("click", e => {
            const t = e.target.closest(".view-profile");
            if (!t)
                return;
            const raw = t.dataset.userid;
            const userId = parseInt(raw ?? "", 10);
            if (Number.isNaN(userId)) {
                console.warn("view-profile clicked but data-userid is invalid:", raw);
                return;
            }
            openProfile(userId);
        });
        document.getElementById("view-my-profile")?.addEventListener("click", () => {
            if (window.__CURRENT_USER_ID)
                openProfile(window.__CURRENT_USER_ID);
        });
        _navProfileInitDone = true;
    }
    const nameEl = document.getElementById("navUsername");
    if (nameEl) {
        const usernameVal = (userInfoGlobal.username ?? "").trim();
        nameEl.textContent = usernameVal;
        nameEl.dataset.userid = String(userInfoGlobal.id);
        nameEl.classList.add("view-profile", "cursor-pointer", "hover:underline", "hover:opacity-80");
    }
}
initNavProfile();
