import "dotenv/config";
import app from "./app";

if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is not configured");

const PORT = Number(process.env.PORT ?? 3000);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
