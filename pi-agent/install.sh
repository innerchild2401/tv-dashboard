#!/bin/sh
# Install the Chromecast watchdog on a Raspberry Pi. Run from the pi-agent directory:
#   sudo ./install.sh
set -eu

cd "$(dirname "$0")"
SRC=$(pwd)

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo ./install.sh" >&2
  exit 1
fi

if command -v apt-get >/dev/null 2>&1; then
  apt-get update
  apt-get install -y python3 python3-venv python3-pip avahi-daemon
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is missing." >&2
  exit 1
fi

if ! python3 -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)'; then
  echo "Python 3.11 or newer is required." >&2
  exit 1
fi

if ! id tv-agent >/dev/null 2>&1; then
  useradd --system --home-dir /opt/tv-dashboard-agent --shell /usr/sbin/nologin tv-agent
fi

install -d -o tv-agent -g tv-agent /opt/tv-dashboard-agent
rm -rf /opt/tv-dashboard-agent/tv_agent
cp -a "$SRC/tv_agent" /opt/tv-dashboard-agent/tv_agent
cp "$SRC/requirements.txt" /opt/tv-dashboard-agent/requirements.txt
chown -R tv-agent:tv-agent /opt/tv-dashboard-agent

python3 -m venv /opt/tv-dashboard-agent/.venv
/opt/tv-dashboard-agent/.venv/bin/pip install --upgrade pip
/opt/tv-dashboard-agent/.venv/bin/pip install -r /opt/tv-dashboard-agent/requirements.txt
chown -R tv-agent:tv-agent /opt/tv-dashboard-agent

if [ ! -f /etc/tv-agent.toml ]; then
  cp "$SRC/tv-agent.toml.example" /etc/tv-agent.toml
fi
chown root:tv-agent /etc/tv-agent.toml
chmod 640 /etc/tv-agent.toml

install -m 644 "$SRC/tv-agent.service" /etc/systemd/system/tv-agent.service
systemctl daemon-reload

if command -v timedatectl >/dev/null 2>&1; then
  timedatectl set-ntp true || true
fi

install -d /etc/systemd/journald.conf.d
printf '%s\n' '[Journal]' 'SystemMaxUse=50M' > /etc/systemd/journald.conf.d/tv-agent.conf
if command -v systemctl >/dev/null 2>&1; then
  systemctl restart systemd-journald || true
fi

TOKEN=$(sed -n 's/^pi_token *= *"\{0,1\}\([^"#]*\)"\{0,1\}.*/\1/p' /etc/tv-agent.toml | head -n 1 | tr -d '[:space:]')
if [ -z "$TOKEN" ]; then
  unset TOKEN
  echo "Edit /etc/tv-agent.toml, then run: sudo systemctl enable --now tv-agent"
  exit 0
fi
unset TOKEN

systemctl enable --now tv-agent
systemctl --no-pager --lines=20 status tv-agent || true
