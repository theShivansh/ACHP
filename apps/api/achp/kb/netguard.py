"""Which addresses the backend may fetch on a user's behalf (URL knowledge bases).

A public deployment must never be pointed at its own network: `http://169.254.169.254/` (cloud metadata),
`http://localhost:8000/` (this API), `http://10.0.0.5/` (a private service). Every URL, and every redirect it
follows, must resolve only to public addresses over http(s). DNS is resolved here and the answer checked; a hostile
DNS server could still change its answer between this check and the connection (rebinding), which only an egress
firewall closes, so this is one layer, not the only one.
"""
from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlsplit

ALLOWED_PORTS = {None, 80, 443, 8080, 8443}
MAX_REDIRECTS = 5


class UnsafeURL(ValueError):
    """The address is not one the backend will fetch. The message is safe to show the user."""


def _is_public(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    mapped = getattr(ip, "ipv4_mapped", None)
    if mapped is not None:
        ip = mapped
    return ip.is_global and not ip.is_multicast


def check_public_url(url: str) -> None:
    """Raise UnsafeURL unless `url` is http(s) on an allowed port and every address its host resolves to is public."""
    parts = urlsplit(url.strip())
    if parts.scheme not in ("http", "https"):
        raise UnsafeURL("The address must start with http:// or https://.")
    host = parts.hostname
    if not host:
        raise UnsafeURL("The address has no host name.")
    if parts.username or parts.password:
        raise UnsafeURL("Addresses with a user name or password are not fetched.")
    try:
        port = parts.port
    except ValueError:
        raise UnsafeURL("The address has an invalid port.") from None
    if port not in ALLOWED_PORTS:
        raise UnsafeURL("Only the standard web ports are fetched.")
    try:
        found = {ipaddress.ip_address(host)}
    except ValueError:
        try:
            infos = socket.getaddrinfo(host, port or (443 if parts.scheme == "https" else 80), type=socket.SOCK_STREAM)
        except socket.gaierror:
            raise UnsafeURL("That address could not be found.") from None
        found = {ipaddress.ip_address(info[4][0]) for info in infos}
    if not found or not all(_is_public(ip) for ip in found):
        raise UnsafeURL("That address points inside a private network, so it is not fetched.")
