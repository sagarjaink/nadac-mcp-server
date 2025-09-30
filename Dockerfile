FROM python:3.11-slim

WORKDIR /app
COPY . /app

RUN pip install --upgrade pip && \
    pip install -r requirements.txt

EXPOSE 8080
CMD ["fastmcp", "run", "server.py", "--port", "8080", "--transport", "streamable-http"]
