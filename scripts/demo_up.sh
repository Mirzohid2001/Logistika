#!/usr/bin/env bash
set -euo pipefail

export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-logistika_demo}"
export API_PORT="${API_PORT:-18083}"
export POSTGRES_PORT="${POSTGRES_PORT:-15436}"
export REDIS_PORT="${REDIS_PORT:-16383}"
export PAYMENTS_ALLOW_MOCK="${PAYMENTS_ALLOW_MOCK:-True}"
export SUBSCRIPTIONS_ENFORCED="${SUBSCRIPTIONS_ENFORCED:-False}"
export SERVE_LOCAL_MEDIA="${SERVE_LOCAL_MEDIA:-True}"

docker compose up -d --build

ready_url="http://127.0.0.1:${API_PORT}/ready/"
for _attempt in $(seq 1 180); do
  if curl --fail --silent "${ready_url}" >/dev/null; then
    break
  fi
  if [[ "${_attempt}" == "180" ]]; then
    echo "Backend did not become ready: ${ready_url}" >&2
    docker compose logs --no-color web >&2
    exit 1
  fi
  sleep 1
done

docker compose exec -T web python manage.py seed_demo

for demo_service in db redis web celery celery-beat; do
  demo_container_id="$(docker compose ps -q "${demo_service}")"
  demo_service_running="false"
  if [[ -n "${demo_container_id}" ]]; then
    demo_service_running="$(docker inspect --format '{{.State.Running}}' "${demo_container_id}")"
  fi
  if [[ "${demo_service_running}" != "true" ]]; then
    echo "Demo service is not running: ${demo_service}" >&2
    docker compose logs --no-color "${demo_service}" >&2
    exit 1
  fi
done

echo "Logistika demo is ready:"
echo "  API:   http://127.0.0.1:${API_PORT}/api/"
echo "  Admin: http://127.0.0.1:${API_PORT}/admin/"
echo "  Docs:  http://127.0.0.1:${API_PORT}/api/docs/"
echo "  Health: http://127.0.0.1:${API_PORT}/ready/"
