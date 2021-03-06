const profileName = document.getElementById("profileName");
const profilePic = document.getElementById("profilePic");
const profileEmail = document.getElementById("profileEmail");
const profilePhone = document.getElementById("profilePhone");
const reservationsList = document.getElementById("reservationsList");
const resInputId = document.getElementById("resInputId");
const cancelBtn = document.getElementById("cancelBtn");

let unsubscribe;
auth.onAuthStateChanged((user) => {
  if (user) {
    unsubscribe = getUserQuery(user.email).onSnapshot((querySnapshot) => {
      const queriedDoc = validateAndGetSingleDoc(querySnapshot);
      if (!queriedDoc) return;

      const userId = queriedDoc.id;
      const userData = queriedDoc.data();
      const isBarberName = userData.isBarber ? "Barber" : "Customer";
      profileName.innerHTML = `${userData.fullName} (${isBarberName})`;
      profilePic.src = userData.profileImg;
      profileEmail.innerHTML = userData.email;
      profilePhone.innerHTML = userData.phone;

      const resRefList = userData.reservations;
      if (resRefList.length != 0) {
        reservationsList.innerHTML = "";
      }
      resRefList.forEach((resRef) => {
        // will be reservations = "reservations"
        const reservations = resRef.parent.id;
        const resId = resRef.id;

        // resDoc holds the actual doc in db
        const resDoc = db.collection(reservations).doc(resId);
        resDoc.onSnapshot((doc) => {
          if (doc.exists) {
            const reservationData = doc.data();
            // could be customer/barber
            let targetId = userData.isBarber
              ? reservationData.customerId
              : reservationData.barberId;

            // handling the case if reservation is created by the barber as a customer
            // so we want to show the properties of the barber
            if (reservationData.customerId == userId) {
              targetId = reservationData.barberId;
            }

            getUser(targetId).then((userTargetDoc) => {
              // filtering out non updated reservations
              const resDbDate = reservationData.date;
              const currentServerDate = firebase.firestore.Timestamp.now();
              if (resDbDate < currentServerDate) {
                return;
              }

              const customerName = userTargetDoc.data().fullName;
              const resDate = resDbDate.toDate().toISOString().split("T")[0];
              const resHours = resDbDate.toDate().getHours();
              const resMinutes = resDbDate.toDate().getMinutes();
              resMinutes = resMinutes == 0 ? "00" : resMinutes;
              const resHtml =
                `<tr id=${doc.id}>` +
                `<td><span class="resName">${customerName}</span></td>` +
                `<td><span class="resDate">${resDate}, ${resHours}:${resMinutes}</span></td>` +
                `<td><span class="resId">id: ${doc.id}</span></td></tr>`;

              const dtResElement = document.getElementById(doc.id);
              if (dtResElement) {
                dtResElement.outerHTML = resHtml;
              } else {
                reservationsList.innerHTML += resHtml;
              }
            });
          } else {
            console.log(`reservation ${doc.id} has been deleted!`);
            // removing element from DOM
            const dtResElement = document.getElementById(doc.id);
            if (dtResElement) dtResElement.remove();
          }
        });
      });
    });
  } else {
    // Unsubscribe when the user signs out
    unsubscribe && unsubscribe();
  }
});

// adding event listener to cancel
cancelBtn.addEventListener("click", () => {
  const resId = resInputId.value;
  if (!resId) {
    alert("No such reservation! please rewrite the correct id");
    return;
  }
  getReservation(resId)
    .then((doc) => {
      const barberId = doc.data().barberId;
      const customerId = doc.data().customerId;
      const customerRef = usersRef.doc(customerId);
      const barberRef = usersRef.doc(barberId);

      // deleting res from reservations
      removeReservation(barberId, customerId, resId)
        .then(() => alert(`Reservation ${doc.id} successfully deleted!`))
        // sending cancellation mails
        // sending mail to barber
        .then(() =>
          getUser(barberId).then((barberDoc) => {
            barberData = barberDoc.data();
            prepareAndSendMail(
              barberData.email,
              barberData.fullName,
              doc.data().date.toDate(),
              doc.id
            );
          })
        )
        // sending mail to barber
        .then(() =>
          getUser(customerId).then((customerDoc) => {
            customerData = customerDoc.data();
            prepareAndSendMail(
              customerData.email,
              customerData.fullName,
              doc.data().date.toDate(),
              doc.id
            );
          })
        )
        .catch((error) =>
          console.error(`Error removing reservation (resId: ${resId}): `, error)
        );
    })
    .catch((error) => console.log("Error getting document:", error));
});

function prepareAndSendMail(emailTo, displayName, resDate, resId) {
  const bodyToSend = `<h2>hello ${displayName}</h2>
    <h4>we would like to inform you that your reservation has been cancelled.</h4>
    <br>
    <table>
      <tr>
        <td>date:</td>
        <td>${resDate}</td>
      </tr>
      <tr>
        <td>reservation id:</td>
        <td>${resId}</td>
      </tr>
    </table>
    <h4>For more information please contact the barber.</h4>
    <br>
    <h5>details about the barber can be found in the website's booking page</h5>`;

  const subjectToSend = "MyBarber reservation has been canceled";
  mailToSend = new Mail(emailTo, subjectToSend, bodyToSend);
  sendMail(mailToSend);
}
