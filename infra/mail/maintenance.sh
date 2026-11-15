#!/bin/bash
set -euo pipefail
cd /opt/workinbox-mail/source/infra/mail
certs=/var/lib/docker/volumes/sftpcloud_ftps-certs/_data
changed=false
sync_cert() {
  local source=$1 cert=$2 key=$3 stamp=$4 hostname=$5 cert_key private_key
  if cmp -s "$source/tls.crt" "$cert" && cmp -s "$source/tls.crt" "$stamp"; then return; fi
  cert_key=$(openssl x509 -in "$source/tls.crt" -pubkey -noout | openssl pkey -pubin -outform DER | sha256sum)
  private_key=$(openssl pkey -in "$source/tls.key" -pubout -outform DER | sha256sum)
  [ "$cert_key" = "$private_key" ] || { echo 'Certificate renewal is incomplete; retaining the current pair' >&2; exit 1; }
  openssl x509 -in "$source/tls.crt" -noout -checkend 86400
  # x509 -checkhost reports a mismatch on stdout but still exits successfully.
  openssl x509 -in "$source/tls.crt" -noout -checkhost "$hostname" | grep -Fx "Hostname $hostname does match certificate"
  install -o 1000 -g 2000 -m 0440 "$source/tls.key" "$key.new"
  install -o 1000 -g 2000 -m 0440 "$source/tls.crt" "$cert.new"
  mv "$key.new" "$key"
  mv "$cert.new" "$cert"
  changed=true
}
sync_cert "$certs" tls/fullchain.pem tls/privkey.pem tls/applied.crt nbg1.cloudfile.dev
if [ -f tls/client-fullchain.pem ]; then
  sync_cert "$certs/mail.workinbox.io" tls/client-fullchain.pem tls/client-privkey.pem tls/client-applied.crt mail.workinbox.io
fi
if "$changed"; then
  systemctl restart workinbox-mail
  cp tls/fullchain.pem tls/applied.crt
  if [ -f tls/client-fullchain.pem ]; then cp tls/client-fullchain.pem tls/client-applied.crt; fi
fi

backup=/opt/workinbox-mail/backups
install -d -m 0700 "$backup"
today=$(date +%F)
last=$(cat "$backup/last-day" 2>/dev/null || true)
if [ "$last" != "$today" ] && [ "$(date +%H)" -ge 3 ]; then
available=$(df -B1 --output=avail "$backup" | tail -1)
[ "$available" -ge 7516192768 ] || { echo 'Not enough disk for a safe backup; retaining previous backup' >&2; exit 1; }
restart() { systemctl start workinbox-mail; }
trap restart EXIT
trap 'exit 1' HUP INT TERM
systemctl stop workinbox-mail
umask 077
# Keep engine blobs, metadata, encrypted credentials and sync journals in one stopped snapshot.
tar -C /opt/workinbox-mail/state -cf - bridge engine config | nice -n 19 gzip -1 > "$backup/mail.tar.gz.new"
gzip -t "$backup/mail.tar.gz.new"
mv "$backup/mail.tar.gz.new" "$backup/mail.tar.gz"
printf '%s\n' "$today" > "$backup/last-day"
restart
trap - EXIT
last=$today
fi

uploaded=$(cat "$backup/uploaded-day" 2>/dev/null || true)
if [ -f "$backup/mail.tar.gz" ] && [ "$uploaded" != "$last" ]; then
  bytes=$(stat -c %s "$backup/mail.tar.gz")
  available=$(df -B1 --output=avail "$backup" | tail -1)
  [ "$available" -ge "$((bytes+3221225472))" ] || { echo 'Not enough disk for upload staging; retaining local backup' >&2; exit 1; }
  temporary="/tmp/workinbox-mail-$(date +%s).tar.gz"
  docker cp "$backup/mail.tar.gz" "sftpcloud-backup-1:$temporary"
  docker exec -i -e "MAIL_BACKUP_DAY=$last" -e "MAIL_BACKUP_FILE=$temporary" \
    sftpcloud-backup-1 timeout 840 /bin/sh < /opt/workinbox-mail/source/infra/mail/upload-backup.sh
  printf '%s\n' "$last" > "$backup/uploaded-day"
fi
