def calculate_penalty(hotspot_count):
    """
    Calculate additional risk penalty based on
    the number of accident hotspots on the route.
    """
    if hotspot_count == 0:
        return 0.00
    elif hotspot_count <= 2:
        return 0.05
    elif hotspot_count <= 5:
        return 0.10
    else:
        return 0.15


def calculate_severity(final_risk):
    """
    Assign severity level based on the final risk score.
    """
    if final_risk < 0.35:
        return "Low"
    elif final_risk < 0.65:
        return "Medium"
    else:
        return "High"


def adjust_risk(predicted_risk, hotspot_count):
    """
    Adjust the ML predicted risk by adding a hotspot penalty
    and determine the final severity.
    """

    # Calculate hotspot penalty
    penalty = calculate_penalty(hotspot_count)

    # Compute final risk score
    final_risk = predicted_risk + penalty

    # Ensure risk never exceeds 1
    final_risk = min(final_risk, 1.0)

    # Assign severity
    severity = calculate_severity(final_risk)

    return final_risk, penalty, severity


# Testing
if __name__ == "__main__":

    predicted_risk = 0.42
    hotspot_count = 4

    final_risk, penalty, severity = adjust_risk(
        predicted_risk,
        hotspot_count
    )

    print("Predicted Risk :", predicted_risk)
    print("Hotspot Count  :", hotspot_count)
    print("Penalty        :", penalty)
    print("Final Risk     :", final_risk)
    print("Severity       :", severity)
