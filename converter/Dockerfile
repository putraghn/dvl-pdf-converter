# Python 3.13 on Debian 13 (trixie), same base family as the API image.
FROM python:3.13-slim-trixie

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app
COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY app.py convert.py ./

# Run as an unprivileged user; the compose file also makes the root filesystem
# read-only and gives the service a tmpfs for /tmp.
RUN useradd --system --uid 10001 --no-create-home converter
USER converter

ENV PORT=5000
EXPOSE 5000
CMD ["python", "app.py"]