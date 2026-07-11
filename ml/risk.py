def calculate_penalty(hotspot_count):
    """
    Calculate penalty based on hotspot count.
    """
    if hotspot_count == 0:
        return 0.00
    elif hotspot_count <= 2:
        return 0.05
    elif hotspot_count <= 5:
        return 0.10
    else:
        return 0.15


def adjust_risk(predicted_risk, hotspot_count):
    """
    Adjust the ML predicted risk using hotspot penalty.
    """
    penalty = calculate_penalty(hotspot_count)
    final_risk = predicted_risk + penalty
    # Risk should never exceed 1
    final_risk = min(final_risk, 1.0)
    return final_risk, penalty


# Testing
if __name__ == "__main__":
    predicted_risk = 0.42
    hotspot_count = 4
    final_risk, penalty = adjust_risk(predicted_risk, hotspot_count)

    print("Predicted Risk :", predicted_risk)
    print("Hotspot Count  :", hotspot_count)
    print("Penalty        :", penalty)
    print("Final Risk     :", final_risk)