import logging
from fastapi import FastAPI, Header, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from backend.app.routes import subjects, predictions, demo_profiles
from backend.app.schemas import ActorContext

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


def get_actor_context(
    x_actor_id: str | None = Header(default=None),
    x_actor_role: str | None = Header(default=None),
) -> ActorContext:
    if not x_actor_id or not x_actor_role:
        raise HTTPException(status_code=401, detail="Actor context is required.")
    try:
        return ActorContext(actor_id=x_actor_id, role=x_actor_role)
    except ValueError as exc:
        raise HTTPException(status_code=403, detail="Actor role is not authorized.") from exc


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


# Centralized error mapping and sanitization
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    logger.warning(f"HTTPException on {request.url.path}: {exc.status_code} - {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": f"http_{exc.status_code}", "message": str(exc.detail)}
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    logger.warning(f"Validation error on {request.url.path}: {exc.errors()}")
    details = {
        str(error["loc"][-1]): error["msg"]
        for error in exc.errors()
        if error.get("loc")
    }
    return JSONResponse(
        status_code=422,
        content={"code": "validation_error", "message": "Request validation failed.", "details": details}
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error(f"Unhandled system error on {request.url.path}", exc_info=exc)
    # Sanitize unhandled exceptions to return a clean 500 error page to user
    return JSONResponse(
        status_code=500,
        content={"code": "internal_error", "message": "An internal system error occurred."}
    )
