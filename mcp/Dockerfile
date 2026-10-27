FROM python:3.12-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    UV_SYSTEM_PYTHON=1

RUN pip install --no-cache-dir uv

COPY pyproject.toml uv.lock* ./
COPY src/ ./src/
COPY README.md ./

RUN uv pip install .

EXPOSE 9100

CMD ["supoclip-mcp"]
