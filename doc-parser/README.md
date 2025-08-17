# Document Parser Service

Go 1.22 microservice for parsing PDF and DOCX documents using UniPDF and gooxml

## Development

```bash
go run main.go
```

## Build

```bash
go build -o doc-parser main.go
```

## Docker

```bash
docker build -t doc-parser .
docker run -p 8080:8080 doc-parser
``` 