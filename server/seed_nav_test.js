require("dotenv").config();
const { db, admin } = require("./src/config/firebase");

async function main() {
  const now = new Date().toISOString();
  const email = "nav-test-volunteer@example.com";
  const password = "TempPass123!";

  let user;
  try {
    user = await admin.auth().getUserByEmail(email);
  } catch {
    user = await admin.auth().createUser({ email, password, displayName: "Nav Test Volunteer" });
  }
  await db.collection("users").doc(user.uid).set(
    {
      uid: user.uid,
      email,
      name: "Nav Test Volunteer",
      role: "volunteer",
      phone: null,
      location: { lat: 6.9271, lng: 79.8612 }, // Colombo
      nic: null,
      homeAddress: null,
      available: true,
      createdAt: now,
    },
    { merge: true }
  );

  const requestRef = await db.collection("aidRequests").add({
    victimId: "seed-victim",
    victimName: "Seed Victim",
    victimNic: null,
    victimHomeAddress: null,
    possibleDuplicate: false,
    disasterType: "flood",
    items: [{ category: "water", quantity: 5, unit: "bottles", status: "matched", donationId: null }],
    requestedCategories: ["water"],
    severity: "high",
    peopleAffected: 3,
    vulnerableGroups: [],
    location: { lat: 6.9147, lng: 79.9733 }, // dropoff, near Colombo
    notes: "Nav test seed request",
    status: "in_progress",
    priorityScore: 80,
    priorityBreakdown: {},
    createdAt: now,
    updatedAt: now,
    verifiedAt: now,
  });

  const donationRef = await db.collection("donations").add({
    donorId: "seed-donor",
    donorName: "Seed Donor",
    category: "water",
    quantity: 5,
    location: { lat: 6.9344, lng: 79.8428 }, // pickup, elsewhere in Colombo
    deliveryMethod: "volunteer",
    notes: "Nav test seed donation",
    status: "matched",
    matchedRequestId: requestRef.id,
    assignedDeliveryId: null,
    deliveryStatus: "accepted",
    createdAt: now,
    updatedAt: now,
  });

  await requestRef.update({
    items: [{ category: "water", quantity: 5, unit: "bottles", status: "matched", donationId: donationRef.id }],
  });

  const deliveryRef = await db.collection("deliveries").add({
    requestId: requestRef.id,
    donationId: donationRef.id,
    category: "water",
    volunteerId: user.uid,
    method: "volunteer",
    status: "accepted",
    currentLocation: null,
    createdAt: now,
    updatedAt: now,
  });

  await donationRef.update({ assignedDeliveryId: deliveryRef.id });

  console.log("Volunteer email:", email);
  console.log("Volunteer password:", password);
  console.log("Delivery id:", deliveryRef.id);
  console.log("Request id:", requestRef.id);
  console.log("Donation id:", donationRef.id);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
