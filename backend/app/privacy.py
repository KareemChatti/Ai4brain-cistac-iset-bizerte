import hashlib
import re

_EMAIL = re.compile(r"\S+@\S+\.\S+")
_PHONE = re.compile(r"(?:\+?\d[\s\-.]?){8,}")
_URL = re.compile(r"https?://|www\.", re.IGNORECASE)
_ALLOWED = re.compile(r"^[\w .'()\-]+$")


def check_nickname(value: str) -> str:
    nickname = " ".join(value.split())
    if not nickname:
        raise ValueError("Nickname cannot be empty.")
    if _EMAIL.search(nickname) or _PHONE.search(nickname) or _URL.search(nickname):
        raise ValueError("Please choose a nickname, not an email, phone number or link.")
    if not _ALLOWED.match(nickname):
        raise ValueError("Nickname may only use letters, digits, spaces and . ' ( ) - _")
    return nickname


def user_hash(user_id: str) -> str:
    return hashlib.sha256(user_id.encode()).hexdigest()
