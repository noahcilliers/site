# One container that runs both servers:
#   - the Python bot on 127.0.0.1:8000 (only reachable inside the container)
#   - the Node site + API on $PORT (what the host exposes to the web)

FROM node:22-slim AS node

FROM python:3.12-slim

# The Node app has no npm dependencies, so the node binary is all we need.
COPY --from=node /usr/local/bin/node /usr/local/bin/node

WORKDIR /app

# CPU-only PyTorch: far smaller than the default build, which bundles CUDA.
RUN pip install --no-cache-dir torch==2.15.0 --index-url https://download.pytorch.org/whl/cpu
COPY bot/requirements-serve.txt bot/
RUN pip install --no-cache-dir -r bot/requirements-serve.txt

# App code last, so code changes don't reinstall the libraries.
COPY . .

# server.py imports `chessbot.*` from bot/
ENV PYTHONPATH=/app/bot \
    PYTHONUNBUFFERED=1 \
    PORT=3000

EXPOSE 3000
CMD ["bash", "start.sh"]
