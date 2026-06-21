import os
import re
import time
import requests
from flask import Flask, jsonify, request, send_from_directory, redirect, session
from flask_cors import CORS
from dotenv import load_dotenv

# Chemins absolus (robuste pour gunicorn / systemd en production)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))      # .../tirage-concours/backend
FRONTEND_DIR = os.path.dirname(BASE_DIR)                    # .../tirage-concours
load_dotenv(os.path.join(BASE_DIR, '.env'))

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path='')
app.secret_key = os.getenv('SECRET_KEY', 'tirage-secret-key-change-moi')
CORS(app, supports_credentials=True)

# Sécurité des cookies de session
app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE='Lax')
if os.getenv('PRODUCTION') == '1':
    # En production (HTTPS), le cookie n'est envoyé qu'en HTTPS
    app.config.update(SESSION_COOKIE_SECURE=True)

YOUTUBE_API_KEY   = os.getenv('YOUTUBE_API_KEY', '')
FB_APP_ID         = os.getenv('FB_APP_ID', '')
FB_APP_SECRET     = os.getenv('FB_APP_SECRET', '')
FB_REDIRECT_URI   = os.getenv('FB_REDIRECT_URI', 'http://localhost:5000/auth/facebook/callback')
FB_CONFIG_ID      = os.getenv('FB_CONFIG_ID', '')
FB_SYSTEM_TOKEN   = os.getenv('FB_SYSTEM_TOKEN', '')
OWNER_PASSWORD    = os.getenv('OWNER_PASSWORD', '')


def meta_user_token():
    """Jeton Meta à utiliser pour la session courante.
    - Client connecté via OAuth → son propre jeton (multi-clients).
    - Propriétaire authentifié par mot de passe → jeton système (.env).
    - Visiteur anonyme → None (rien n'est exposé)."""
    if session.get('meta_logged_out'):
        return None
    # Client : son propre compte (OAuth)
    if session.get('fb_access_token'):
        return session['fb_access_token']
    # Propriétaire : jeton système, UNIQUEMENT après mot de passe
    if session.get('owner_authed') and FB_SYSTEM_TOKEN:
        return FB_SYSTEM_TOKEN
    return None
TT_CLIENT_KEY     = os.getenv('TT_CLIENT_KEY', '')
TT_CLIENT_SECRET  = os.getenv('TT_CLIENT_SECRET', '')
TT_REDIRECT_URI   = os.getenv('TT_REDIRECT_URI', 'http://localhost:5000/auth/tiktok/callback')


# ===== FRONTEND =====
@app.route('/')
def index():
    return send_from_directory(FRONTEND_DIR, 'index.html')


# ===== YOUTUBE =====

def extraire_video_id(url):
    patterns = [r'(?:v=|youtu\.be/|embed/)([A-Za-z0-9_-]{11})']
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    if re.match(r'^[A-Za-z0-9_-]{11}$', url.strip()):
        return url.strip()
    return None


def get_youtube_comments(video_id, max_comments=1000):
    if not YOUTUBE_API_KEY:
        raise Exception("Clé API YouTube manquante. Configure YOUTUBE_API_KEY dans .env")

    comments = []
    url = "https://www.googleapis.com/youtube/v3/commentThreads"
    params = {
        "part": "snippet",
        "videoId": video_id,
        "maxResults": 100,
        "key": YOUTUBE_API_KEY,
        "textFormat": "plainText",
        "order": "time"
    }

    while len(comments) < max_comments:
        response = requests.get(url, params=params, timeout=10)
        data = response.json()

        if "error" in data:
            msg = data["error"]["message"]
            if "commentsDisabled" in msg.lower():
                raise Exception("Les commentaires sont désactivés sur cette vidéo.")
            if "quotaExceeded" in msg:
                raise Exception("Quota API YouTube dépassé. Réessaie demain.")
            raise Exception(f"Erreur YouTube : {msg}")

        for item in data.get("items", []):
            snippet = item["snippet"]["topLevelComment"]["snippet"]
            comments.append({
                "nom": snippet.get("authorDisplayName", "Inconnu"),
                "commentaire": snippet.get("textDisplay", "")
            })

        next_page = data.get("nextPageToken")
        if not next_page:
            break
        params["pageToken"] = next_page

    return comments[:max_comments]


@app.route('/api/youtube/comments', methods=['POST'])
def youtube_comments():
    data = request.get_json()
    url_or_id = data.get('url', '').strip()
    # Illimité (plafond de sécurité très élevé pour éviter un emballement)
    max_comments = min(int(data.get('max', 1000000)), 1000000)

    if not url_or_id:
        return jsonify({"error": "URL manquante"}), 400

    video_id = extraire_video_id(url_or_id)
    if not video_id:
        return jsonify({"error": "URL YouTube invalide. Exemple : https://www.youtube.com/watch?v=XXXXXXXXX"}), 400

    try:
        comments = get_youtube_comments(video_id, max_comments)
        return jsonify({"success": True, "video_id": video_id, "total": len(comments), "comments": comments})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ===== FACEBOOK / INSTAGRAM =====

GRAPH = "https://graph.facebook.com/v18.0"


def fb_get(path, token, params=None, retries=3):
    """Appel GET à l'API Graph, avec réessais sur lenteur réseau, erreur lisible sinon."""
    p = dict(params or {})
    p["access_token"] = token
    last_err = None
    for attempt in range(retries):
        try:
            r = requests.get(f"{GRAPH}/{path}", params=p, timeout=30)
            data = r.json()
            if isinstance(data, dict) and "error" in data:
                err = data["error"]
                code = err.get("code", 0)
                msg = err.get("message", "Erreur inconnue")
                if code == 190:
                    raise Exception("Session Meta expirée. Reconnectez-vous.")
                raise Exception(f"Erreur Meta : {msg}")
            return data
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
            last_err = e
            time.sleep(1.5 * (attempt + 1))  # petite pause croissante avant de réessayer
    raise Exception("Connexion à Facebook trop lente (réseau instable). Réessayez dans un instant.")


def load_user_pages(user_token):
    """Récupère les Pages gérées par l'utilisateur + leurs tokens, et les met en session."""
    data = fb_get("me/accounts", user_token, {"fields": "id,name,access_token,fan_count", "limit": 100})
    pages = {}
    for p in data.get("data", []):
        pages[p["id"]] = {
            "name": p.get("name", "Page"),
            "token": p.get("access_token"),
            "fans": p.get("fan_count", 0)
        }

    # Cas "Nouvelle expérience Pages" : l'utilisateur s'est connecté directement
    # en tant que Page → /me/accounts est vide, mais /me EST la page elle-même.
    if not pages:
        me = fb_get("me", user_token, {"fields": "id,name"})
        if me.get("id"):
            pages[me["id"]] = {
                "name": me.get("name", "Ma Page"),
                "token": user_token,  # le token courant agit comme token de page
                "fans": 0
            }

    session['fb_pages'] = pages
    return pages


def get_page_token(page_id):
    pages = session.get('fb_pages', {})
    page = pages.get(page_id)
    if not page:
        # Recharge la liste (utile avec le jeton système si la session s'est vidée)
        pages = load_user_pages(meta_user_token())
        page = pages.get(page_id)
    if not page:
        raise Exception("Page introuvable. Rechargez la liste des pages.")
    return page["token"]


def collect_fb_comments(post_id, token, page_id=None, max_comments=5000):
    """Tous les commentaires d'un post Facebook (principaux + réponses).
    Exclut les commentaires de la page elle-même (le propriétaire)."""
    out = []
    params = {"fields": "from,message", "filter": "stream", "limit": 100}
    path = f"{post_id}/comments"
    while len(out) < max_comments:
        data = fb_get(path, token, params)
        for item in data.get("data", []):
            frm = item.get("from", {})
            if page_id and frm.get("id") == page_id:
                continue  # commentaire/réponse de la page = propriétaire, exclu
            out.append({
                "nom": frm.get("name", "Utilisateur Facebook"),
                "commentaire": item.get("message", "")
            })
        nxt = data.get("paging", {}).get("cursors", {}).get("after")
        if not data.get("paging", {}).get("next") or not nxt:
            break
        params["after"] = nxt
    return out[:max_comments]


def fetch_all_items(path, token, fields, cap=200, limit=50):
    """Pagine une liste d'objets (posts/médias) jusqu'à `cap`."""
    items = []
    params = {"fields": fields, "limit": limit}
    while len(items) < cap:
        data = fb_get(path, token, params)
        items.extend(data.get("data", []))
        nxt = data.get("paging", {}).get("cursors", {}).get("after")
        if not data.get("paging", {}).get("next") or not nxt:
            break
        params["after"] = nxt
    return items[:cap]


def collect_ig_comments(media_id, token, owner_username=None, max_comments=5000):
    """Tous les commentaires d'un post Instagram (principaux + réponses).
    Exclut les commentaires du propriétaire du compte."""
    owner = (owner_username or "").lstrip("@").lower()
    out = []
    params = {"fields": "username,text,replies{username,text}", "limit": 50}
    path = f"{media_id}/comments"
    while len(out) < max_comments:
        data = fb_get(path, token, params)
        for item in data.get("data", []):
            u = item.get("username", "inconnu")
            if not owner or u.lower() != owner:
                out.append({"nom": "@" + u, "commentaire": item.get("text", "")})
            for rep in item.get("replies", {}).get("data", []):
                ru = rep.get("username", "inconnu")
                if not owner or ru.lower() != owner:
                    out.append({"nom": "@" + ru, "commentaire": rep.get("text", "")})
        nxt = data.get("paging", {}).get("cursors", {}).get("after")
        if not data.get("paging", {}).get("next") or not nxt:
            break
        params["after"] = nxt
    return out[:max_comments]


# ===== FACEBOOK : pages → posts → commentaires =====

@app.route('/api/facebook/pages')
def facebook_pages():
    token = meta_user_token()
    if not token:
        return jsonify({"error": "Compte Facebook non connecté", "need_auth": True}), 401
    try:
        pages = load_user_pages(token)
        out = [{"id": pid, "name": p["name"], "fans": p["fans"]} for pid, p in pages.items()]
        return jsonify({"success": True, "pages": out})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/facebook/posts')
def facebook_posts():
    if not meta_user_token():
        return jsonify({"error": "Non connecté", "need_auth": True}), 401
    page_id = request.args.get('page_id', '').strip()
    if not page_id:
        return jsonify({"error": "page_id manquant"}), 400
    try:
        token = get_page_token(page_id)
        fields = "id,message,created_time,full_picture,comments.summary(true).limit(0)"

        # On essaie plusieurs sources : posts, puis feed, puis published_posts
        raw = []
        for edge in ("posts", "feed", "published_posts"):
            try:
                items = fetch_all_items(f"{page_id}/{edge}", token, fields, cap=200)
                if items:
                    raw = items
                    break
            except Exception:
                continue

        posts = []
        for p in raw:
            posts.append({
                "id": p["id"],
                "message": (p.get("message", "") or "(sans texte)")[:120],
                "date": p.get("created_time", "")[:10],
                "image": p.get("full_picture", ""),
                "comment_count": p.get("comments", {}).get("summary", {}).get("total_count", 0)
            })
        posts.sort(key=lambda x: x["comment_count"], reverse=True)
        return jsonify({"success": True, "posts": posts})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/facebook/post_comments', methods=['POST'])
def facebook_post_comments():
    if not meta_user_token():
        return jsonify({"error": "Non connecté", "need_auth": True}), 401
    data = request.get_json()
    post_id = data.get('post_id', '').strip()
    page_id = data.get('page_id', '').strip()
    max_comments = min(int(data.get('max', 2000)), 5000)
    if not post_id or not page_id:
        return jsonify({"error": "post_id ou page_id manquant"}), 400
    try:
        token = get_page_token(page_id)
        comments = collect_fb_comments(post_id, token, page_id=page_id, max_comments=max_comments)
        return jsonify({"success": True, "total": len(comments), "comments": comments})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ===== INSTAGRAM : comptes → médias → commentaires =====

@app.route('/api/instagram/accounts')
def instagram_accounts():
    token = meta_user_token()
    if not token:
        return jsonify({"error": "Compte Instagram non connecté", "need_auth": True}), 401
    try:
        pages = session.get('fb_pages') or load_user_pages(token)
        accounts = []
        for pid, p in pages.items():
            try:
                d = fb_get(pid, p["token"], {"fields": "instagram_business_account{id,username,followers_count}"})
                iga = d.get("instagram_business_account")
                if iga:
                    accounts.append({
                        "ig_id": iga["id"],
                        "username": iga.get("username", "compte"),
                        "page_id": pid,
                        "followers": iga.get("followers_count", 0)
                    })
            except Exception:
                continue
        return jsonify({"success": True, "accounts": accounts})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/instagram/media')
def instagram_media():
    if not meta_user_token():
        return jsonify({"error": "Non connecté", "need_auth": True}), 401
    ig_id = request.args.get('ig_id', '').strip()
    page_id = request.args.get('page_id', '').strip()
    if not ig_id or not page_id:
        return jsonify({"error": "ig_id ou page_id manquant"}), 400
    try:
        token = get_page_token(page_id)
        items = fetch_all_items(
            f"{ig_id}/media", token,
            "id,caption,comments_count,media_type,media_url,thumbnail_url,timestamp",
            cap=200
        )
        media = []
        for m in items:
            img = m.get("thumbnail_url") or m.get("media_url", "")
            media.append({
                "id": m["id"],
                "caption": (m.get("caption", "") or "(sans légende)")[:120],
                "date": m.get("timestamp", "")[:10],
                "image": img,
                "comment_count": m.get("comments_count", 0)
            })
        media.sort(key=lambda x: x["comment_count"], reverse=True)
        return jsonify({"success": True, "media": media})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/instagram/media_comments', methods=['POST'])
def instagram_media_comments():
    if not meta_user_token():
        return jsonify({"error": "Non connecté", "need_auth": True}), 401
    data = request.get_json()
    media_id = data.get('media_id', '').strip()
    page_id = data.get('page_id', '').strip()
    owner_username = data.get('owner_username', '').strip()
    max_comments = min(int(data.get('max', 2000)), 5000)
    if not media_id or not page_id:
        return jsonify({"error": "media_id ou page_id manquant"}), 400
    try:
        token = get_page_token(page_id)
        # Si le nom du propriétaire n'est pas fourni, on le récupère depuis la page
        if not owner_username:
            try:
                d = fb_get(page_id, token, {"fields": "instagram_business_account{username}"})
                owner_username = d.get("instagram_business_account", {}).get("username", "")
            except Exception:
                owner_username = ""
        comments = collect_ig_comments(media_id, token, owner_username, max_comments)
        return jsonify({"success": True, "total": len(comments), "comments": comments})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- OAuth Facebook/Instagram ---
@app.route('/auth/facebook')
def auth_facebook():
    if not FB_APP_ID:
        return "FB_APP_ID manquant dans .env", 500

    url = (
        f"https://www.facebook.com/v18.0/dialog/oauth"
        f"?client_id={FB_APP_ID}"
        f"&redirect_uri={FB_REDIRECT_URI}"
        f"&response_type=code"
    )
    # Facebook Login for Business : on utilise config_id (les permissions sont dans la config)
    if FB_CONFIG_ID:
        url += f"&config_id={FB_CONFIG_ID}"
    else:
        scope = "pages_read_engagement,instagram_basic,instagram_manage_comments,pages_show_list"
        url += f"&scope={scope}"

    return redirect(url)


@app.route('/auth/facebook/callback')
def auth_facebook_callback():
    code = request.args.get('code')
    if not code:
        return redirect('/?auth=error')

    # Échanger le code contre un token
    token_url = "https://graph.facebook.com/v18.0/oauth/access_token"
    r = requests.get(token_url, params={
        "client_id": FB_APP_ID,
        "client_secret": FB_APP_SECRET,
        "redirect_uri": FB_REDIRECT_URI,
        "code": code
    }, timeout=10)
    data = r.json()

    if "access_token" in data:
        session['fb_access_token'] = data['access_token']
        return redirect('/?auth=success')
    else:
        return redirect('/?auth=error')


@app.route('/auth/status')
def auth_status():
    # Déconnexion manuelle demandée
    if session.get('meta_logged_out'):
        return jsonify({"connected": False})

    # Client connecté via OAuth (son propre compte)
    token = session.get('fb_access_token')
    if token:
        r = requests.get("https://graph.facebook.com/v18.0/me", params={"access_token": token}, timeout=5)
        data = r.json()
        if "error" in data:
            session.pop('fb_access_token', None)
            return jsonify({"connected": False})
        return jsonify({"connected": True, "name": data.get("name", "")})

    # Propriétaire authentifié par mot de passe → jeton système
    if session.get('owner_authed') and FB_SYSTEM_TOKEN:
        return jsonify({"connected": True, "name": "E-services (propriétaire)", "system": True})

    # Visiteur anonyme : rien d'exposé
    return jsonify({"connected": False})


@app.route('/auth/logout')
def auth_logout():
    session.pop('fb_access_token', None)
    session.pop('fb_pages', None)
    session.pop('owner_authed', None)
    session['meta_logged_out'] = True
    return jsonify({"success": True})


@app.route('/auth/owner-login', methods=['POST'])
def auth_owner_login():
    """Connexion du propriétaire par mot de passe → débloque le jeton système."""
    if not OWNER_PASSWORD or not FB_SYSTEM_TOKEN:
        return jsonify({"error": "Mode propriétaire non configuré"}), 400
    data = request.get_json() or {}
    if data.get('password', '') != OWNER_PASSWORD:
        return jsonify({"error": "Mot de passe incorrect"}), 401
    session['owner_authed'] = True
    session.pop('meta_logged_out', None)
    return jsonify({"connected": True})


@app.route('/auth/reconnect')
def auth_reconnect():
    """Annule la déconnexion manuelle (reprend l'état précédent : propriétaire ou client)."""
    session.pop('meta_logged_out', None)
    connected = bool((session.get('owner_authed') and FB_SYSTEM_TOKEN) or session.get('fb_access_token'))
    return jsonify({"connected": connected})


# ===== TIKTOK =====

def extraire_tiktok_video_id(url_or_id):
    """Extrait l'ID de la vidéo TikTok depuis l'URL."""
    # ID numérique direct
    if re.match(r'^\d+$', str(url_or_id).strip()):
        return url_or_id.strip()
    # URL format: /video/1234567890
    match = re.search(r'/video/(\d+)', url_or_id)
    if match:
        return match.group(1)
    return None


def get_tiktok_comments(video_id, access_token, max_comments=500):
    """Récupère les commentaires d'une vidéo TikTok via l'API v2."""
    comments = []
    url = "https://open.tiktokapis.com/v2/video/comment/list/"
    params = {
        "fields": "id,video_id,text,like_count,create_time",
        "video_id": video_id
    }
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }

    cursor = 0
    while len(comments) < max_comments:
        params["cursor"] = cursor
        params["max_count"] = min(100, max_comments - len(comments))

        response = requests.get(url, params=params, headers=headers, timeout=10)
        data = response.json()

        error = data.get("error", {})
        if error.get("code") and error["code"] != "ok":
            msg = error.get("message", "Erreur inconnue")
            if "permission" in msg.lower() or "scope" in msg.lower():
                raise Exception("Permission refusée. Vérifiez que votre app TikTok a le scope 'video.comment.list'.")
            raise Exception(f"Erreur TikTok : {msg}")

        items = data.get("data", {}).get("comments", [])
        for item in items:
            comments.append({
                "nom": "TikTok User",
                "commentaire": item.get("text", "")
            })

        has_more = data.get("data", {}).get("has_more", False)
        cursor = data.get("data", {}).get("cursor", 0)
        if not has_more or not items:
            break

    return comments[:max_comments]


@app.route('/api/tiktok/comments', methods=['POST'])
def tiktok_comments():
    access_token = session.get('tt_access_token')
    if not access_token:
        return jsonify({"error": "Compte TikTok non connecté", "need_auth": True}), 401

    data = request.get_json()
    url_or_id = data.get('url', '').strip()
    max_comments = min(int(data.get('max', 500)), 2000)

    if not url_or_id:
        return jsonify({"error": "URL de la vidéo manquante"}), 400

    video_id = extraire_tiktok_video_id(url_or_id)
    if not video_id:
        raise Exception("URL TikTok invalide. Exemple : https://www.tiktok.com/@user/video/1234567890")

    try:
        comments = get_tiktok_comments(video_id, access_token, max_comments)
        return jsonify({"success": True, "total": len(comments), "comments": comments})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/auth/tiktok')
def auth_tiktok():
    if not TT_CLIENT_KEY:
        return "TT_CLIENT_KEY manquant dans .env", 500
    import secrets as sec
    state = sec.token_hex(16)
    session['tt_state'] = state
    scope = "user.info.basic,video.list,video.comment.list"
    url = (
        f"https://www.tiktok.com/v2/auth/authorize/"
        f"?client_key={TT_CLIENT_KEY}"
        f"&scope={scope}"
        f"&response_type=code"
        f"&redirect_uri={TT_REDIRECT_URI}"
        f"&state={state}"
    )
    return redirect(url)


@app.route('/auth/tiktok/callback')
def auth_tiktok_callback():
    code = request.args.get('code')
    state = request.args.get('state')

    if not code or state != session.get('tt_state'):
        return redirect('/?auth_tt=error')

    # Échange du code contre un token
    r = requests.post("https://open.tiktokapis.com/v2/oauth/token/", data={
        "client_key": TT_CLIENT_KEY,
        "client_secret": TT_CLIENT_SECRET,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": TT_REDIRECT_URI
    }, headers={"Content-Type": "application/x-www-form-urlencoded"}, timeout=10)

    data = r.json()
    if "access_token" in data:
        session['tt_access_token'] = data['access_token']
        # Récupérer le nom d'utilisateur
        user_r = requests.get(
            "https://open.tiktokapis.com/v2/user/info/?fields=display_name,username",
            headers={"Authorization": f"Bearer {data['access_token']}"},
            timeout=5
        )
        user_data = user_r.json().get("data", {}).get("user", {})
        session['tt_username'] = user_data.get("display_name") or user_data.get("username", "TikTok User")
        return redirect('/?auth_tt=success')
    else:
        return redirect('/?auth_tt=error')


@app.route('/auth/tiktok/status')
def auth_tiktok_status():
    token = session.get('tt_access_token')
    if not token:
        return jsonify({"connected": False})
    return jsonify({"connected": True, "name": session.get('tt_username', 'TikTok User')})


@app.route('/auth/tiktok/logout')
def auth_tiktok_logout():
    session.pop('tt_access_token', None)
    session.pop('tt_username', None)
    session.pop('tt_state', None)
    return jsonify({"success": True})


if __name__ == '__main__':
    app.run(debug=True, port=5000)
