FROM python:3.11-slim

WORKDIR /app
COPY . /app

RUN pip install --upgrade pip && \
    pip install -r requirements.txt

EXPOSE 8080
CMD ["sh", "-c", "fastmcp run server.py --port $PORT --host 0.0.0.0 --transport streamable-http"]
