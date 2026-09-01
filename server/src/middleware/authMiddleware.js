const { auth, db } = require("../config/firebase");

/**
 * Verifies the Firebase ID token sent by the frontend in the
 * "Authorization: Bearer <token>" header. On success, attaches
 * req.user = { uid, email, role, ...profile } to the request.
 *
 * The frontend gets this token from Firebase Auth's client SDK after
 * login, e.g.: const token = await firebase.auth().currentUser.getIdToken();
 */
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.split("Bearer ")[1] : null;

    if (!token) {
      return res.status(401).json({ error: "Missing Authorization header. Expected: Bearer <token>" });
    }

    const decoded = await auth.verifyIdToken(token);

    // Pull the user's profile (which includes their role) from Firestore.
    const userDoc = await db.collection("users").doc(decoded.uid).get();

    if (!userDoc.exists) {
      return res.status(403).json({
        error: "No profile found for this user. Call POST /api/users/profile first after registering.",
      });
    }

    req.user = { uid: decoded.uid, email: decoded.email, ...userDoc.data() };
    next();
  } catch (err) {
    console.error("Auth error:", err.message);
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

/**
 * Restricts a route to specific roles. Use after requireAuth.
 * Example: router.get("/", requireAuth, requireRole("admin"), handler)
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: `This action requires one of these roles: ${allowedRoles.join(", ")}` });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
