FROM golang:1.27 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/crawler ./cmd/crawler \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/import-cashnodes ./cmd/import-cashnodes

FROM gcr.io/distroless/static-debian12
COPY --from=build /out/ /usr/local/bin/
ENTRYPOINT ["/usr/local/bin/crawler"]
