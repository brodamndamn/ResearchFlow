#!/usr/bin/env bash
set -euo pipefail

project_dir="/opt/researchflow"
frontend_dir="/var/www/research"
service_file="/etc/systemd/system/researchflow.service"

cd "${project_dir}/frontend"
pnpm install --frozen-lockfile
pnpm build

install -d -m 0755 "${frontend_dir}"
cp -R dist/. "${frontend_dir}/"

cd "${project_dir}/backend"
python3.12 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install .
install -d -o www-data -g www-data -m 0750 data

install -m 0644 "${project_dir}/deploy/researchflow.service" "${service_file}"
systemctl daemon-reload
systemctl enable --now researchflow
systemctl restart researchflow

nginx -t
systemctl reload nginx
