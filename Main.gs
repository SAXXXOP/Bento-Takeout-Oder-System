function onFormSubmit(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);

    const context = FormService.parse(e);

    const reservation = ReservationService.create(context);

    OrderService.save(reservation);
    CustomerService.update(reservation);

    LineService.notifyReservation(reservation);

    ReservationService.cleanup(context.userId);

  } catch (err) {
    console.error("onFormSubmit error:", err);
  } finally {
    lock.releaseLock();
  }
}
