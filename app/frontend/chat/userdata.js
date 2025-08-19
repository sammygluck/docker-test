export async function fetchUserData(userID) {
    try {
        const userResponse = await fetch(`/user/${userID}`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
        });
        if (!userResponse.ok) {
            throw new Error(`Error fetching user: ${userResponse.statusText}`);
        }
        const userData = await userResponse.json();
        if (!userData.blocked_users)
            userData.blocked_users = "[]";
        if (userData.friends) {
            const friendDetails = await Promise.all(JSON.parse(userData.friends).map(async (friendId) => {
                const friendResponse = await fetch(`/user/${friendId}`, {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem("token")}`,
                    },
                });
                if (!friendResponse.ok) {
                    throw new Error(`Error fetching friend ${friendId}: ${friendResponse.statusText}`);
                }
                const friendData = await friendResponse.json();
                return {
                    id: friendData.id,
                    username: friendData.username,
                    online: friendData.online,
                    new_message: false,
                    chat_history: [],
                };
            }));
            userData.friendlist = friendDetails;
        }
        else if (!userData.friends) {
            userData.friendlist = [];
        }
        return userData;
    }
    catch (error) {
        console.error("Error fetching user data:", error);
    }
    return null;
}
export async function addFriend(userID) {
    try {
        const response = await fetch(`/friend`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ friendId: userID }),
        });
        if (!response.ok) {
            throw new Error(`Error adding friend: ${response.statusText}`);
        }
    }
    catch (error) {
        alert("Failed to add friend. Please try again later.");
    }
}
export async function removeFriend(userID) {
    try {
        const response = await fetch(`/friend`, {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ friendId: userID }),
        });
        if (!response.ok) {
            throw new Error(`Error removing friend: ${response.statusText}`);
        }
    }
    catch (error) {
        alert("Failed to remove friend. Please try again later.");
    }
}
export async function blockUser(userID) {
    try {
        const response = await fetch(`/block`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ userId: userID }),
        });
        if (!response.ok) {
            throw new Error(`Error blocking user: ${response.statusText}`);
        }
    }
    catch (error) {
        alert("Failed to block user. Please try again later.");
    }
}
export async function unblockUser(userID) {
    try {
        const response = await fetch(`/block`, {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ userId: userID }),
        });
        if (!response.ok) {
            throw new Error(`Error unblocking user: ${response.statusText}`);
        }
    }
    catch (error) {
        alert("Failed to unblock user. Please try again later.");
    }
}
