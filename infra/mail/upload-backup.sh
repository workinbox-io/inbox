#!/bin/sh
set -eu
: "${S3_ENDPOINT:?}" "${S3_BUCKET:?}" "${S3_ACCESS_KEY:?}" "${S3_SECRET_KEY:?}" "${MAIL_BACKUP_DAY:?}"
: "${MAIL_BACKUP_FILE:?}"
case "$MAIL_BACKUP_FILE" in /tmp/workinbox-mail-*.tar.gz) ;; *) exit 1 ;; esac
trap 'rm -f "$MAIL_BACKUP_FILE"' EXIT
trap 'exit 1' HUP INT TERM
export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" AWS_DEFAULT_REGION="${S3_REGION:-us-east-1}"
aws() { command aws --endpoint-url "$S3_ENDPOINT" "$@"; }
prefix="s3://$S3_BUCKET/_backups/workinbox-mail"
aws s3 cp --only-show-errors "$MAIL_BACKUP_FILE" "$prefix/$MAIL_BACKUP_DAY.tar.gz"
cutoff=$(date -u -d "@$(( $(date +%s) - 14 * 86400 ))" +%F)
aws s3 ls "$prefix/" | awk '{print $4}' | while read -r name; do
  case "$name" in
    [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9].tar.gz)
      [ "${name%.tar.gz}" \< "$cutoff" ] && aws s3 rm --only-show-errors "$prefix/$name" || true ;;
  esac
done
echo 'Offsite mail backup uploaded; encryption key remains separate'
