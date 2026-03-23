import React from "react";

interface AppProviderProps {
	children: React.ReactNode;
}

function AppProvider(props: AppProviderProps) {
	return <>{props.children}</>;
}

export default AppProvider;
