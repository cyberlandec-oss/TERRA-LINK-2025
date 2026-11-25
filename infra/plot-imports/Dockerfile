FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-gdal ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY reader.py /app/reader.py
COPY reader_test.py /app/reader_test.py
USER 65534:65534
ENV PROJ_NETWORK=OFF GDAL_DISABLE_READDIR_ON_OPEN=EMPTY_DIR
EXPOSE 8091
CMD ["/usr/bin/python3", "/app/reader.py"]
