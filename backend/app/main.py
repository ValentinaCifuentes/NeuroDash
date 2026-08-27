import logging
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from backend.app.routes import subjects, predictions, demo_profiles, telemetry

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("neuradash")

app = FastAPI(
    title="NeuraDash CORE API",
    version="2.0.0",
    description="FastAPI implementation of NeuraDash CORE prediction and outcomes lifecycle API."
)

# Register routers
app.include_router(subjects.router)
app.include_router(predictions.router)
app.include_router(demo_profiles.router)
app.include_router(telemetry.router)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


# Centralized error mapping and sanitization
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    logger.warning(f"HTTPException on {request.url.path}: {exc.status_code} - {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    logger.warning(f"Validation error on {request.url.path}: {exc.errors()}")
    # Format error detail neatly
    return JSONResponse(
        status_code=422,
        content={"detail": str(exc.errors())}
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error(f"Unhandled system error on {request.url.path}", exc_info=exc)
    # Sanitize unhandled exceptions to return a clean 500 error page to user
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal system error occurred. Details have been logged."}
    )
