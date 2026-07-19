import pandas as pd
import numpy as np
import joblib
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.model_selection import train_test_split
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

df = pd.read_csv("../dataset/indian_roads_dataset.csv")

drop_cols = [
    "accident_id",
    "city",
    "state",
    "date",
    "time",
    "vehicles_involved",
    "casualties",
    "accident_severity",
    "cause",
    "traffic_density"
]

df_ml = df.drop(columns=drop_cols)

df_ml["festival"] = df_ml["festival"].fillna("No Festival")

X = df_ml.drop("risk_score", axis=1)
y = df_ml["risk_score"]

cat_cols = X.select_dtypes(include="object").columns.tolist()
num_cols = X.select_dtypes(exclude="object").columns.tolist()

print("Features:", list(X.columns))
print(f"Categorical: {cat_cols}")
print(f"Numerical: {num_cols}")

preprocessor = ColumnTransformer(
    transformers=[
        ("cat", OneHotEncoder(handle_unknown="ignore"), cat_cols)
    ],
    remainder="passthrough"
)

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

X_train_encoded = preprocessor.fit_transform(X_train)
X_test_encoded = preprocessor.transform(X_test)

model = GradientBoostingRegressor(
    n_estimators=400,
    learning_rate=0.05,
    max_depth=2,
    min_samples_split=2,
    min_samples_leaf=2,
    subsample=1.0,
    random_state=42
)

model.fit(X_train_encoded, y_train)

y_pred = model.predict(X_test_encoded)

mae = mean_absolute_error(y_test, y_pred)
rmse = np.sqrt(mean_squared_error(y_test, y_pred))
r2 = r2_score(y_test, y_pred)

print(f"\nMAE : {mae:.4f}")
print(f"RMSE: {rmse:.4f}")
print(f"R²  : {r2:.4f}")

feature_names = preprocessor.get_feature_names_out()
importances = model.feature_importances_
importance_df = pd.DataFrame({
    "Feature": feature_names,
    "Importance": importances
}).sort_values("Importance", ascending=False)

print("\nFeature Importances:")
print(importance_df.to_string(index=False))

joblib.dump(model, "best_gradient_boosting.pkl")
joblib.dump(preprocessor, "preprocessor.pkl")

print("\nModel and preprocessor saved successfully!")
