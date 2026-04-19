from fastapi import APIRouter, Query

from app.core.http import ApiResponse, success_response
from app.schemas.stats import BatchInsightsRead, ComparisonMetricsRead, MetricsComparisonRead, PaginatedStreamingAlertsRead
from app.service.metrics import batch_metrics_snapshot_store, paginate_items, streaming_metrics_store

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("/streaming", response_model=ApiResponse[ComparisonMetricsRead])
def get_streaming_metrics():
    streaming_metrics = streaming_metrics_store.snapshot()

    return success_response(
        "Streaming metrics retrieved successfully.",
        {
            "avg_heart_rate": streaming_metrics["avg_heart_rate"],
            "avg_oxygen": streaming_metrics["avg_oxygen"],
            "avg_temperature": streaming_metrics["avg_temperature"],
            "alerts": streaming_metrics["total_alerts"],
            "execution_time_ms": streaming_metrics["execution_time_ms"],
        },
    )


@router.get("/batch", response_model=ApiResponse[ComparisonMetricsRead])
def get_batch_metrics():
    batch_metrics = batch_metrics_snapshot_store.metrics_snapshot()

    return success_response(
        "Batch metrics retrieved successfully.",
        {
            "avg_heart_rate": batch_metrics["avg_heart_rate"],
            "avg_oxygen": batch_metrics["avg_oxygen"],
            "avg_temperature": batch_metrics["avg_temperature"],
            "alerts": batch_metrics["total_alerts"],
            "execution_time_ms": batch_metrics["execution_time_ms"],
        },
    )


@router.get("/batch-insights", response_model=ApiResponse[BatchInsightsRead])
def get_batch_insights(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=5, ge=1, le=50),
    departments_page: int | None = Query(default=None, ge=1),
    diagnoses_page: int | None = Query(default=None, ge=1),
):
    insights = batch_metrics_snapshot_store.insights_snapshot()
    current_departments_page = departments_page or page
    current_diagnoses_page = diagnoses_page or page

    return success_response(
        "Batch insights retrieved successfully.",
        {
            "patients_per_department": paginate_items(
                insights["patients_per_department"],
                current_departments_page,
                page_size,
            ),
            "top_diagnosis": paginate_items(
                insights["top_diagnosis"],
                current_diagnoses_page,
                page_size,
            ),
        },
    )


@router.get("/streaming-alerts", response_model=ApiResponse[PaginatedStreamingAlertsRead])
def get_streaming_alerts(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=3, ge=1, le=10),
):
    return success_response(
        "Streaming alerts retrieved successfully.",
        streaming_metrics_store.alerts_snapshot(page, page_size),
    )


@router.get("/comparison", response_model=ApiResponse[MetricsComparisonRead])
def get_metrics_comparison():
    streaming_metrics = streaming_metrics_store.snapshot()
    batch_metrics = batch_metrics_snapshot_store.metrics_snapshot()

    return success_response(
        "Comparison metrics retrieved successfully.",
        {
            "streaming": {
                "avg_heart_rate": streaming_metrics["avg_heart_rate"],
                "avg_oxygen": streaming_metrics["avg_oxygen"],
                "avg_temperature": streaming_metrics["avg_temperature"],
                "alerts": streaming_metrics["total_alerts"],
                "execution_time_ms": streaming_metrics["execution_time_ms"],
            },
            "batch": {
                "avg_heart_rate": batch_metrics["avg_heart_rate"],
                "avg_oxygen": batch_metrics["avg_oxygen"],
                "avg_temperature": batch_metrics["avg_temperature"],
                "alerts": batch_metrics["total_alerts"],
                "execution_time_ms": batch_metrics["execution_time_ms"],
            },
        },
    )
