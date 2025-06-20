import { useState, useEffect, useCallback, useMemo } from "react";
import yaml from 'js-yaml';

export function useEnemyData() {
    const [rawEnemyGroups, setRawEnemyGroups] = useState("");
    const [rawEnemyConfigurationTable, setRawEnemyConfigurationTable] = useState("");
    const [enemyGroups, setEnemyGroups] = useState([]);
    const [enemyConfigurationTable, setEnemyConfigurationTable] = useState([]);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (rawEnemyGroups === "") {
            return;
        }
        const groups = yaml.load(rawEnemyGroups);
        const groupsArray = Object.entries(groups).map(([id, data]) => ({ id: parseInt(id), data }));
        setEnemyGroups(groupsArray);
    }, [rawEnemyGroups]);

    useEffect(() => {
        if (rawEnemyConfigurationTable === "") {
            return;
        }
        const config = yaml.load(rawEnemyConfigurationTable);
        const configArray = Object.entries(config).map(([id, data]) => ({ id: parseInt(id), data }));
        setEnemyConfigurationTable(configArray);
    }, [rawEnemyConfigurationTable]);

    useEffect(() => {
        const fetchEnemyGroups = async () => {
            try {
                const baseUrl = process.env.PUBLIC_URL || '';
                const enemyGroups = await fetch(`${baseUrl}/data/enemy_groups.yml`);
                
                if (!enemyGroups.ok) {
                    throw new Error(`HTTP error! status: ${enemyGroups.status}`);
                }
                
                setRawEnemyGroups( await enemyGroups.text());
            } catch (err) {
                setError(err.message);
            }
        };
        
        fetchEnemyGroups();
    }, []); // Empty dependency array - only run once

    useEffect(() => {
        const fetchEnemyConfigurationTable = async () => {
            try {
                const baseUrl = process.env.PUBLIC_URL || '';
                const enemyConfigurationTable = await fetch(`${baseUrl}/data/enemy_configuration_table.yml`);

                if (!enemyConfigurationTable.ok) {
                    throw new Error(`HTTP error! status: ${enemyConfigurationTable.status}`);
                }

                setRawEnemyConfigurationTable( await enemyConfigurationTable.text());
            } catch (err) {
                setError(err.message);
            }
        };

        fetchEnemyConfigurationTable();
    }, []); // Empty dependency array - only run once

    const enemiesInGroup = useCallback((groupId) => {
        if (!enemyConfigurationTable || !enemyGroups || !enemyGroups[groupId]) {
            return null;
        }
        const group = enemyGroups[groupId].data;
        if (!groupId) {
            return null;
        }
        const enemies = group["Enemies"]
            .filter((enemy) => enemy["Amount"] > 0)
            .map((enemy) => enemyConfigurationTable[enemy["Enemy"]])
            .filter((enemy) => enemy?.id && enemy?.data)
            .map((enemy) => ({
                ...enemy,
                toString: () => `<Enemy ${enemy.id}: ${enemy.data["Name"]}>`
            }));
        return enemies;
    }, [enemyConfigurationTable, enemyGroups]);

    const enemiesForBgLayers = useCallback((layer1, layer2) => {
        if (!enemyGroups || enemyGroups.length === 0) {
            return null;
        }
        const enemies = enemyGroups
            .filter((group) => group.data["Background 1"] === layer1 && group.data["Background 2"] === layer2)
            .flatMap((group) => enemiesInGroup(group.id))
            .map((enemy) => enemy.data.Name);
        return [...new Set(enemies)];
    }, [enemyGroups, enemiesInGroup]);

    const randomEnemyGroup = useCallback(() => {
        if (!enemyGroups || enemyGroups.length === 0) {
            return null;
        }
        const randomIndex = Math.floor(Math.random() * enemyGroups.length);
        const randomEnemyGroup = enemyGroups[randomIndex]?.data;
        const enemiesListString = enemiesInGroup(randomIndex).map((enemy) => enemy.toString()).join(", ");
        return {
            id: randomIndex,
            ...randomEnemyGroup,
            toString: () => `EnemyGroup(id: ${randomIndex}, Enemies: ${enemiesListString}, BG: ${randomEnemyGroup["Background 1"]}|${randomEnemyGroup["Background 2"]})`
        };
    }, [enemyGroups, enemiesInGroup]);

    const api = useMemo(() => ({
      randomEnemyGroup,
      enemiesInGroup,
      enemiesForBgLayers,
      error
    }), [randomEnemyGroup, enemiesInGroup, enemiesForBgLayers, error]);

    return api;
}
