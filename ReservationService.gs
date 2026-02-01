const ReservationService = (() => {

  function create(ctx) {
    const props = PropertiesService.getScriptProperties();
    const todayStr = Utilities.formatDate(new Date(), "JST", "MMdd");

    const lastDate = props.getProperty("LAST_DATE");
    const lastNum = Number(props.getProperty("LAST_NUM") || 0);
    const count = (lastDate === todayStr) ? lastNum + 1 : 1;

    props.setProperty("LAST_DATE", todayStr);
    props.setProperty("LAST_NUM", count.toString());

    return {
      ...ctx,
      reservationNo: `${todayStr}-${("0" + count).slice(-2)}`
    };
  }

  function cleanup(userId) {
    if (!userId) return;
    const props = PropertiesService.getUserProperties();
    props.deleteProperty(`CHANGE_TARGET_${userId}`);
    props.deleteProperty(`CHANGE_LIST_${userId}`);
  }

  return { create, cleanup };

})();
