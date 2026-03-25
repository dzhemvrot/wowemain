function daysUntilSummer() {
    const today = new Date();
    const year = today.getFullYear();

    let summerStart = new Date(year, 5, 1);
    const summerEnd = new Date(year, 7, 31);

    if (today >= summerStart && today <= summerEnd) {
        return "It's summer time! :)";
    }

    if (today > summerEnd) {
        summerStart = new Date(year + 1, 5, 1);
    }

    const diffTime = summerStart - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return `Hold on, people! The summer is near, only ${diffDays} more days!`;
}

function daysUntilBDay() {
    const today = new Date();
    const year = today.getFullYear();

    let BDay = new Date(year, 5, 30);

    if (today == BDay) {
        return "It's my birthday :D";
    }

    if (today > BDay) {
        BDay = new Date(year + 1, 5, 30);
    }

    const diffTime = BDay - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return `My birthday is in ${diffDays} days ;)`;
}

function currentAge() {
	var dob = new Date("06/30/2007");   
	var month_diff = Date.now() - dob.getTime();  
	var age_dt = new Date(month_diff);   
	var year = age_dt.getUTCFullYear();  
	var age = Math.abs(year - 1970);  
	var currentyear = new Date().getFullYear(); 
	var willbe = currentyear - 2007;
	var returntext = `Currently I am <b>${age}</b> years old`;
	if (willbe == age) {
		returntext += ". ";
	} else {
		returntext += `, and this year I will be <b>${willbe}</b>! `;
	}
	return returntext;
}

document.getElementById("summerCountdown").textContent = daysUntilSummer();
document.getElementById("BDayCountdown").textContent = daysUntilBDay();
document.getElementById("AgeCounter").innerHTML = currentAge();