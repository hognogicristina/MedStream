def calculate_latency(start, end):
    if not start or not end:
        return None
    return (end - start).total_seconds() * 1000
